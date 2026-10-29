#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$BACKEND_DIR/.run"
PID_FILE="$RUN_DIR/backend.pid"
LOG_FILE="$RUN_DIR/backend.log"

has_property() {
    local file="$1"
    local key="$2"
    grep -Eq "^[[:space:]]*${key}[[:space:]]*=[[:space:]]*[^[:space:]#]" "$file"
}

property_value_length() {
    local file="$1"
    local key="$2"
    awk -F= -v key="$key" '
        $1 ~ "^[[:space:]]*" key "[[:space:]]*$" {
            value = substr($0, index($0, "=") + 1)
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
            print length(value)
            exit
        }
    ' "$file"
}

is_backend_process() {
    local pid="$1"
    local command

    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    [[ "$command" == *"spring-boot:run"* ]]
}

start_backend() {
    if [[ -z "${SPRING_DATASOURCE_URL:-}" && -z "${DATABASE_URL:-}" \
            && ! -f "$BACKEND_DIR/.env" && ! -f "$BACKEND_DIR/database.properties" ]]; then
        echo "Create backend/.env with DATABASE_URL or set SPRING_DATASOURCE_URL or DATABASE_URL before starting." >&2
        exit 1
    fi
    if [[ -n "${JWT_SECRET:-}" ]]; then
        if [[ ${#JWT_SECRET} -lt 32 ]]; then
            echo "JWT_SECRET must be at least 32 characters." >&2
            exit 1
        fi
    elif [[ -f "$BACKEND_DIR/.env" ]] && has_property "$BACKEND_DIR/.env" "JWT_SECRET"; then
        local secret_length
        secret_length="$(property_value_length "$BACKEND_DIR/.env" "JWT_SECRET")"
        if [[ ! "$secret_length" =~ ^[0-9]+$ || "$secret_length" -lt 32 ]]; then
            echo "JWT_SECRET in backend/.env must be at least 32 characters." >&2
            exit 1
        fi
    else
        if ! command -v openssl >/dev/null 2>&1; then
            echo "OpenSSL is required to generate a JWT secret, or set JWT_SECRET in backend/.env." >&2
            exit 1
        fi
        umask 077
        printf 'JWT_SECRET=%s\n' "$(openssl rand -base64 48)" >> "$BACKEND_DIR/.env"
        chmod 600 "$BACKEND_DIR/.env"
        echo "Generated a private JWT_SECRET in the git-ignored backend/.env."
    fi
    if [[ -f "$BACKEND_DIR/.env" ]]; then
        chmod 600 "$BACKEND_DIR/.env"
    fi

    mkdir -p "$RUN_DIR"
    if [[ -f "$PID_FILE" ]]; then
        local existing_pid
        existing_pid="$(<"$PID_FILE")"
        if [[ ! "$existing_pid" =~ ^[0-9]+$ ]]; then
            echo "Invalid PID file at $PID_FILE; inspect and remove it before starting." >&2
            exit 1
        fi
        if kill -0 "$existing_pid" 2>/dev/null; then
            if is_backend_process "$existing_pid"; then
                echo "Backend is already running (PID $existing_pid)."
                exit 0
            fi
            echo "PID $existing_pid is in use by another process; refusing to start." >&2
            exit 1
        fi
        rm "$PID_FILE"
    fi

    cd "$BACKEND_DIR"
    nohup "$BACKEND_DIR/mvnw" -f "$BACKEND_DIR/pom.xml" spring-boot:run \
        >> "$LOG_FILE" 2>&1 < /dev/null &
    local backend_pid=$!
    printf '%s\n' "$backend_pid" > "$PID_FILE"

    for _ in {1..120}; do
        if curl --silent --fail --max-time 2 http://localhost:8080/ --output /dev/null; then
            echo "Backend is ready at http://localhost:8080 (PID $backend_pid)."
            echo "Logs: $LOG_FILE"
            return
        fi
        if ! kill -0 "$backend_pid" 2>/dev/null; then
            rm -f "$PID_FILE"
            echo "Backend exited during startup. Recent log output:" >&2
            tail -n 50 "$LOG_FILE" >&2
            exit 1
        fi
        sleep 1
    done

    echo "Backend process is still running, but it did not become HTTP-ready within 120 seconds." >&2
    echo "PID: $backend_pid; logs: $LOG_FILE" >&2
    echo "Check startup with: $0 logs" >&2
    exit 1
}

stop_backend() {
    if [[ ! -f "$PID_FILE" ]]; then
        echo "Backend is not running (no PID file)."
        exit 0
    fi

    local backend_pid
    backend_pid="$(<"$PID_FILE")"
    if [[ ! "$backend_pid" =~ ^[0-9]+$ ]]; then
        echo "Invalid PID file at $PID_FILE; refusing to stop any process." >&2
        exit 1
    fi
    if ! kill -0 "$backend_pid" 2>/dev/null; then
        rm "$PID_FILE"
        echo "Removed stale PID file; backend was not running."
        exit 0
    fi
    if ! is_backend_process "$backend_pid"; then
        echo "PID $backend_pid does not appear to be the backend; refusing to stop it." >&2
        exit 1
    fi

    kill -TERM "$backend_pid"
    for _ in {1..20}; do
        if ! is_backend_process "$backend_pid"; then
            rm -f "$PID_FILE"
            echo "Backend stopped."
            return
        fi
        sleep 1
    done
    echo "Backend is still stopping. Check logs before taking further action: $LOG_FILE" >&2
    exit 1
}

show_status() {
    if [[ ! -f "$PID_FILE" ]]; then
        echo "Backend is not running."
        return
    fi
    local backend_pid
    backend_pid="$(<"$PID_FILE")"
    if [[ "$backend_pid" =~ ^[0-9]+$ ]] && is_backend_process "$backend_pid"; then
        echo "Backend process is running (PID $backend_pid)."
        echo "API: http://localhost:8080"
        echo "Logs: $LOG_FILE"
    else
        echo "Backend is not running; PID file may be stale: $PID_FILE"
    fi
}

case "${1:-}" in
    start)
        start_backend
        ;;
    stop)
        stop_backend
        ;;
    restart)
        if [[ -f "$PID_FILE" ]]; then
            stop_backend
        fi
        start_backend
        ;;
    status)
        show_status
        ;;
    logs)
        if [[ ! -f "$LOG_FILE" ]]; then
            echo "No backend log exists yet: $LOG_FILE" >&2
            exit 1
        fi
        tail -n 100 -f "$LOG_FILE"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}" >&2
        exit 2
        ;;
esac
