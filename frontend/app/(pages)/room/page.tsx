"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { BackendApiError } from "@/lib/api-client";
import { hasSession } from "@/lib/session-state";
import { backendApi } from "@/lib/backend-api";
import type { RoomJoinRequest, RoomParticipant, RoomSummary } from "@/lib/backend-types";
import { CreateRoomSchema } from "@/lib/page-schemas";
import { notifyRoomsChanged } from "@/lib/room-events";

const PAGE_CLASS = "flex min-h-full flex-col bg-[#090909] px-4 py-8 text-white sm:px-8";
const CONTAINER_CLASS = "flex w-full flex-1 flex-col";
const CARD_GRID_CLASS = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
const CARD_CLASS = "flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111111] p-5";
const PANEL_CLASS = "rounded-2xl border border-white/10 bg-[#111111] px-5 py-8 text-sm text-zinc-500";
const SKELETON_CARD_COUNT = 80;

function messageFrom(error: unknown): string {
    if (error instanceof TypeError) {
        return "Cannot reach the server. Check your connection and try again.";
    }
    return error instanceof Error ? error.message : "The request could not be completed.";
}

function roomPath(roomId?: string): string {
    return roomId ? `/room?roomId=${encodeURIComponent(roomId)}` : "/room";
}

function PageIntro() {
    return (
        <section className="mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Find your people</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Rooms</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Create a room for your community, or request to join an existing room.
            </p>
        </section>
    );
}

function CreateRoomIntro() {
    return (
        <>
            <h2 className="text-lg font-semibold">Create a room</h2>
            <p className="mt-1 text-sm text-zinc-500">You’ll be made an admin as soon as the room is created.</p>
        </>
    );
}

function DiscoverIntro() {
    return (
        <div>
            <h2 className="text-lg font-semibold">Discover rooms</h2>
            <p className="mt-1 text-sm text-zinc-500">Send a join request to a room admin.</p>
        </div>
    );
}

// Takes up the remaining page height without adding to it, so the placeholder
// cards reach the bottom of the screen on any display and never cause a scrollbar.
function RoomCardSkeletons() {
    return (
        <div role="status" className="relative min-h-64 flex-1">
            <span className="sr-only">Loading rooms…</span>
            <ul aria-hidden="true" className={`absolute inset-0 content-start overflow-hidden ${CARD_GRID_CLASS}`}>
                {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                    <li key={index} className={CARD_CLASS}>
                        <div className="min-w-0 flex-1 animate-pulse motion-reduce:animate-none">
                            <div className="h-6 w-2/3 rounded-md bg-white/10" />
                            <div className="mt-1 h-4 w-2/5 rounded-md bg-white/5" />
                        </div>
                        <div className="h-8 w-24 shrink-0 animate-pulse rounded-lg bg-white/10 motion-reduce:animate-none" />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function RoomsPageFallback() {
    return (
        <div className={PAGE_CLASS}>
            <div className={CONTAINER_CLASS}>
                <PageIntro />
                <section className="mb-8 rounded-2xl border border-white/10 bg-[#111111] p-5 sm:p-6">
                    <CreateRoomIntro />
                    <div className="mt-4 h-11 max-w-2xl animate-pulse rounded-lg bg-white/5 motion-reduce:animate-none" />
                </section>
                <section className="flex flex-1 flex-col">
                    <div className="mb-4">
                        <DiscoverIntro />
                    </div>
                    <RoomCardSkeletons />
                </section>
            </div>
        </div>
    );
}

export default function RoomsPage() {
    return (
        <Suspense fallback={<RoomsPageFallback />}>
            <RoomsPageContent />
        </Suspense>
    );
}

function RoomsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedRoomId = searchParams.get("roomId");
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const [participants, setParticipants] = useState<RoomParticipant[]>([]);
    const [participantsRoomId, setParticipantsRoomId] = useState("");
    const [participantsError, setParticipantsError] = useState("");
    const [requests, setRequests] = useState<Record<string, RoomJoinRequest>>({});
    const [joinedRoomIds, setJoinedRoomIds] = useState<string[]>([]);
    const [roomName, setRoomName] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [joiningRoomId, setJoiningRoomId] = useState("");
    const dialogRef = useRef<HTMLElement>(null);

    const fetchRooms = useCallback(async () => {
        const [availableRooms, conversations] = await Promise.all([
            backendApi.rooms.list(),
            backendApi.conversations.list(),
        ]);
        const joinedIds = conversations
            .filter((conversation) => conversation.type === "GROUP")
            .map((conversation) => conversation.id);
        const statuses = await Promise.all(availableRooms.filter((room) => !joinedIds.includes(room.id)).map(async (room) => {
            try {
                return [room.id, await backendApi.rooms.getMyJoinRequest(room.id)] as const;
            } catch (requestError) {
                // A 404 means no request exists. Any other API failure only loses this room's
                // status, which shouldn't hide every room; the backend still rejects duplicates.
                if (requestError instanceof BackendApiError && requestError.status !== 401) {
                    return null;
                }
                throw requestError;
            }
        }));
        return {
            rooms: availableRooms,
            joinedRoomIds: joinedIds,
            requests: Object.fromEntries(statuses.filter((entry) => entry !== null)),
        };
    }, []);

    const applyRooms = useCallback((result: Awaited<ReturnType<typeof fetchRooms>>) => {
        setRooms(result.rooms);
        setJoinedRoomIds(result.joinedRoomIds);
        setRequests(result.requests);
        setHasLoaded(true);
    }, []);

    const handleLoadError = useCallback((loadError: unknown) => {
        // A failed token refresh clears the session, so there is nothing left to retry.
        if (!hasSession()) {
            router.replace("/auth/login");
            return;
        }
        setError(messageFrom(loadError));
    }, [router]);

    useEffect(() => {
        if (!hasSession()) {
            router.replace("/auth/login");
            return;
        }

        let active = true;
        void fetchRooms()
            .then((result) => {
                if (active) applyRooms(result);
            })
            .catch((loadError: unknown) => {
                if (active) handleLoadError(loadError);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [applyRooms, fetchRooms, handleLoadError, router]);

    const selectedRoom = rooms.find((room) => room.id === requestedRoomId);
    const selectedRoomIsMember = selectedRoom ? joinedRoomIds.includes(selectedRoom.id) : false;
    const memberRoomId = selectedRoom && selectedRoomIsMember ? selectedRoom.id : "";
    const isDialogOpen = Boolean(selectedRoom);

    useEffect(() => {
        if (!memberRoomId) return;
        let active = true;
        void backendApi.rooms.listParticipants(memberRoomId)
            .then((result) => {
                if (active) {
                    setParticipants(result);
                    setParticipantsError("");
                    setParticipantsRoomId(memberRoomId);
                }
            })
            .catch((loadError: unknown) => {
                if (active) {
                    setParticipants([]);
                    setParticipantsError(messageFrom(loadError));
                    setParticipantsRoomId(memberRoomId);
                }
            });
        return () => {
            active = false;
        };
    }, [memberRoomId]);

    useEffect(() => {
        if (!isDialogOpen) return;
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialogRef.current?.focus();

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                window.history.replaceState(null, "", roomPath());
                return;
            }
            if (event.key !== "Tab") return;
            const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
            if (!focusable?.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const focused = document.activeElement;
            if (event.shiftKey && (focused === first || focused === dialogRef.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && focused === last) {
                event.preventDefault();
                first.focus();
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            previouslyFocused?.focus({ preventScroll: true });
        };
    }, [isDialogOpen]);

    function openRoom(roomId: string) {
        setError("");
        setNotice("");
        window.history.replaceState(null, "", roomPath(roomId));
    }

    function closeRoom() {
        window.history.replaceState(null, "", roomPath());
    }

    async function reloadRooms() {
        setError("");
        setNotice("");
        setIsRefreshing(true);
        try {
            applyRooms(await fetchRooms());
        } catch (loadError) {
            handleLoadError(loadError);
        } finally {
            setIsRefreshing(false);
        }
    }

    async function createRoom(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");
        setNotice("");
        const parsed = CreateRoomSchema.safeParse({ roomname: roomName });
        if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? "Enter a valid room name.");
            return;
        }

        setIsCreating(true);
        try {
            const created = await backendApi.rooms.create(parsed.data.roomname);
            setRoomName("");
            setNotice(`Room “${created.title || parsed.data.roomname}” created. You are its admin.`);
            notifyRoomsChanged();
            // The room exists by now, so a failed reload must not read as a failed create.
            try {
                applyRooms(await fetchRooms());
            } catch (loadError) {
                handleLoadError(loadError);
            }
        } catch (createError) {
            setError(messageFrom(createError));
        } finally {
            setIsCreating(false);
        }
    }

    async function requestToJoin(room: RoomSummary) {
        setError("");
        setNotice("");
        setJoiningRoomId(room.id);
        try {
            const request = await backendApi.rooms.requestToJoin(room.id);
            setRequests((current) => ({ ...current, [room.id]: request }));
            setNotice(`Your request to join “${room.roomname}” has been sent.`);
        } catch (joinError) {
            setError(messageFrom(joinError));
        } finally {
            setJoiningRoomId("");
        }
    }

    const messages = (
        <>
            {error && (
                <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-950/50 px-4 py-3 text-sm text-red-200">
                    {error}
                </p>
            )}
            {notice && (
                <p role="status" className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
                    {notice}
                </p>
            )}
        </>
    );

    return (
        <div className={PAGE_CLASS}>
            <div className={CONTAINER_CLASS}>
                <PageIntro />

                {/* While the dialog is open these render inside it, where they can be seen. */}
                {!selectedRoom && messages}

                <section className="mb-8 rounded-2xl border border-white/10 bg-[#111111] p-5 sm:p-6">
                    <CreateRoomIntro />
                    <form onSubmit={createRoom} className="mt-4 flex max-w-2xl flex-col gap-3 sm:flex-row">
                        <Input
                            value={roomName}
                            onChange={(event) => setRoomName(event.target.value)}
                            maxLength={100}
                            aria-label="Room name"
                            placeholder="e.g. Weekend hikers"
                            className="h-11 border-white/10 bg-black/40 text-white placeholder:text-zinc-600"
                        />
                        <Button type="submit" disabled={isCreating} className="h-11 bg-red-600 px-6 text-white hover:bg-red-500">
                            {isCreating ? "Creating…" : "Create room"}
                        </Button>
                    </form>
                </section>

                <section className="flex flex-1 flex-col">
                    <div className="mb-4 flex items-end justify-between gap-3">
                        <DiscoverIntro />
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isLoading || isRefreshing}
                            onClick={() => void reloadRooms()}
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        >
                            {isRefreshing ? "Refreshing…" : "Refresh"}
                        </Button>
                    </div>

                    {isLoading || (isRefreshing && !hasLoaded) ? (
                        <RoomCardSkeletons />
                    ) : !hasLoaded ? (
                        <p className={PANEL_CLASS}>Rooms could not be loaded. Use Refresh to try again.</p>
                    ) : rooms.length === 0 ? (
                        <p className={PANEL_CLASS}>No rooms yet. Create the first one above.</p>
                    ) : (
                        <ul className={CARD_GRID_CLASS}>
                            {rooms.map((room) => {
                                const request = requests[room.id];
                                const isMember = joinedRoomIds.includes(room.id);
                                return (
                                    <li id={`room-${room.id}`} key={room.id} className={`scroll-mt-4 ${CARD_CLASS}`}>
                                        <div className="min-w-0 flex-1">
                                            <button
                                                type="button"
                                                onClick={() => openRoom(room.id)}
                                                title={room.roomname}
                                                className="block w-full truncate rounded-sm text-left font-medium text-white outline-none hover:text-red-200 focus-visible:ring-2 focus-visible:ring-red-500/60"
                                            >
                                                {room.roomname}
                                            </button>
                                            <p className="mt-1 text-xs text-zinc-500">
                                                Created {new Date(room.createdAt).toLocaleDateString()}
                                            </p>
                                            {request && request.status !== "PENDING" && (
                                                <p className="mt-2 text-xs text-red-300">Request {request.status.toLowerCase()}</p>
                                            )}
                                        </div>
                                        {isMember ? (
                                            <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
                                                Member
                                            </span>
                                        ) : request?.status === "PENDING" ? (
                                            <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
                                                Pending
                                            </span>
                                        ) : (
                                            <Button
                                                type="button"
                                                disabled={joiningRoomId === room.id}
                                                onClick={() => void requestToJoin(room)}
                                                className="shrink-0 bg-red-600 text-white hover:bg-red-500"
                                            >
                                                {joiningRoomId === room.id ? "Sending…" : request ? "Request again" : "Request to join"}
                                            </Button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
            {selectedRoom && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:left-[280px]">
                    <button
                        type="button"
                        aria-label="Close room details"
                        tabIndex={-1}
                        onClick={closeRoom}
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                    />
                    <section
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="room-dialog-title"
                        tabIndex={-1}
                        className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#111111] p-5 shadow-2xl outline-none sm:p-6"
                    >
                        <header className="flex items-start gap-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">Room details</p>
                                <h2 id="room-dialog-title" className="mt-2 break-words text-xl font-semibold">{selectedRoom.roomname}</h2>
                                <p className="mt-2 text-sm text-zinc-500">Created {new Date(selectedRoom.createdAt).toLocaleDateString()}</p>
                            </div>
                            <button
                                type="button"
                                aria-label="Close room details"
                                onClick={closeRoom}
                                className="rounded-lg p-2 text-zinc-400 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-red-500/60"
                            >
                                <X className="size-5" />
                            </button>
                        </header>
                        <div className="mt-5">
                            {messages}
                            {selectedRoomIsMember ? (
                                <>
                                    <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">You are a member of this room.</p>
                                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Members</h3>
                                    {participantsRoomId !== selectedRoom.id ? (
                                        <p className="mt-3 text-sm text-zinc-500">Loading room members…</p>
                                    ) : participantsError ? (
                                        <p role="alert" className="mt-3 text-sm text-red-300">{participantsError}</p>
                                    ) : participants.length === 0 ? (
                                        <p className="mt-3 text-sm text-zinc-500">No members to show.</p>
                                    ) : (
                                        <ul className="mt-3 space-y-2">
                                            {participants.map((participant) => (
                                                <li key={participant.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2">
                                                    <ProfileAvatar avatarUrl={participant.avatarUrl} label={participant.displayName || participant.username || "ChatApp user"} className="size-9" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm text-white">{participant.displayName || participant.username || "ChatApp user"}</span>
                                                        <span className="block truncate text-xs text-zinc-500">@{participant.username || "no username"}</span>
                                                    </span>
                                                    <span className="shrink-0 text-xs text-zinc-500">{participant.role.toLowerCase()}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="text-sm leading-6 text-zinc-400">
                                        {requests[selectedRoom.id]
                                            ? `Your join request is ${requests[selectedRoom.id].status.toLowerCase()}.`
                                            : "Request to join this room. A room admin will review your request."}
                                    </p>
                                    <Button
                                        type="button"
                                        disabled={joiningRoomId === selectedRoom.id || requests[selectedRoom.id]?.status === "PENDING"}
                                        onClick={() => void requestToJoin(selectedRoom)}
                                        className="mt-4 bg-red-600 text-white hover:bg-red-500"
                                    >
                                        {joiningRoomId === selectedRoom.id
                                            ? "Sending…"
                                            : requests[selectedRoom.id]?.status === "PENDING"
                                                ? "Request pending"
                                                : requests[selectedRoom.id]
                                                    ? "Request again"
                                                    : "Request to join"}
                                    </Button>
                                </>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
