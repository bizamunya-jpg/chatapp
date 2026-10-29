"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { BackendApiError, getBackendBaseUrl } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-token";
import { backendApi } from "@/lib/backend-api";
import type { RoomJoinRequest, RoomParticipant, RoomSummary } from "@/lib/backend-types";
import { CreateRoomSchema } from "@/lib/page-schemas";

function messageFrom(error: unknown): string {
    if (error instanceof TypeError) {
        return `Cannot reach the backend at ${getBackendBaseUrl()}. Confirm Spring Boot is running and NEXT_PUBLIC_BACKEND_URL points to its address.`;
    }
    return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function RoomsPage() {
    return (
        <Suspense fallback={<div className="min-h-full bg-[#090909]" />}>
            <RoomsPageContent />
        </Suspense>
    );
}

function RoomsPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedRoomId = searchParams.get("roomId");
    const [rooms, setRooms] = useState<RoomSummary[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState("");
    const [participants, setParticipants] = useState<RoomParticipant[]>([]);
    const [participantsRoomId, setParticipantsRoomId] = useState("");
    const [requests, setRequests] = useState<Record<string, RoomJoinRequest>>({});
    const [joinedRoomIds, setJoinedRoomIds] = useState<string[]>([]);
    const [roomName, setRoomName] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [joiningRoomId, setJoiningRoomId] = useState("");

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
                if (requestError instanceof BackendApiError && requestError.status === 404) {
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

    const refreshRooms = useCallback(async () => {
        const result = await fetchRooms();
        setRooms(result.rooms);
        setJoinedRoomIds(result.joinedRoomIds);
        setRequests(result.requests);
    }, [fetchRooms]);

    useEffect(() => {
        if (!getAccessToken()) {
            router.replace("/auth/login");
            return;
        }

        let active = true;
        void fetchRooms()
            .then((result) => {
                if (!active) return;
                setRooms(result.rooms);
                setJoinedRoomIds(result.joinedRoomIds);
                setRequests(result.requests);
                setSelectedRoomId(result.rooms.some((room) => room.id === requestedRoomId) ? requestedRoomId ?? "" : "");
            })
            .catch((loadError: unknown) => {
                if (active) setError(messageFrom(loadError));
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [fetchRooms, requestedRoomId, router]);

    const selectedRoom = rooms.find((room) => room.id === selectedRoomId);
    const selectedRoomIsMember = selectedRoom ? joinedRoomIds.includes(selectedRoom.id) : false;

    useEffect(() => {
        if (!selectedRoom || !selectedRoomIsMember) return;
        let active = true;
        void backendApi.rooms.listParticipants(selectedRoom.id)
            .then((result) => {
                if (active) {
                    setParticipants(result);
                    setParticipantsRoomId(selectedRoom.id);
                }
            })
            .catch((loadError: unknown) => {
                if (active) setError(messageFrom(loadError));
            });
        return () => {
            active = false;
        };
    }, [selectedRoom, selectedRoomIsMember]);

    useEffect(() => {
        if (!selectedRoom) return;
        function closeOnEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setSelectedRoomId("");
                router.replace("/room", { scroll: false });
            }
        }
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [router, selectedRoom]);

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
            await refreshRooms();
            setNotice(`Room “${created.title || parsed.data.roomname}” created. You are its admin.`);
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

    return (
        <main className="min-h-full bg-[#090909] px-4 py-8 text-white sm:px-8">
            <div className="mx-auto max-w-5xl">
                <section className="mb-10">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-400">Find your people</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Rooms</h1>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                        Create a room for your community, or request to join an existing room.
                    </p>
                </section>

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

                <section className="mb-8 rounded-2xl border border-white/10 bg-[#111111] p-5 sm:p-6">
                    <h2 className="text-lg font-semibold">Create a room</h2>
                    <p className="mt-1 text-sm text-zinc-500">You’ll be made an admin as soon as the room is created.</p>
                    <form onSubmit={createRoom} className="mt-4 flex flex-col gap-3 sm:flex-row">
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

                <section>
                    <div className="mb-4 flex items-end justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">Discover rooms</h2>
                            <p className="mt-1 text-sm text-zinc-500">Send a join request to a room admin.</p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isLoading}
                            onClick={() => {
                                setError("");
                                void refreshRooms().catch((loadError: unknown) => setError(messageFrom(loadError)));
                            }}
                            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                        >
                            Refresh
                        </Button>
                    </div>

                    {isLoading ? (
                        <p className="rounded-2xl border border-white/10 bg-[#111111] px-5 py-8 text-sm text-zinc-500">Loading rooms…</p>
                    ) : rooms.length === 0 ? (
                        <p className="rounded-2xl border border-white/10 bg-[#111111] px-5 py-8 text-sm text-zinc-500">
                            No rooms yet. Create the first one above.
                        </p>
                    ) : (
                        <ul className="grid gap-3 sm:grid-cols-2">
                            {rooms.map((room) => {
                                const request = requests[room.id];
                                const isMember = joinedRoomIds.includes(room.id);
                                return (
                                    <li id={`room-${room.id}`} key={room.id} className="flex scroll-mt-4 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#111111] p-5">
                                        <div className="min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedRoomId(room.id)}
                                                className="truncate text-left font-medium text-white hover:text-red-200"
                                            >
                                                {room.roomname}
                                            </button>
                                            <p className="mt-1 text-xs text-zinc-500">
                                                Created {new Date(room.createdAt).toLocaleDateString()}
                                            </p>
                                            {request && (
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
                        onClick={() => {
                            setSelectedRoomId("");
                            router.replace("/room", { scroll: false });
                        }}
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                    />
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="room-dialog-title"
                        className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#111111] p-5 shadow-2xl sm:p-6"
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
                                onClick={() => {
                                    setSelectedRoomId("");
                                    router.replace("/room", { scroll: false });
                                }}
                                className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
                            >
                                <X className="size-5" />
                            </button>
                        </header>
                        <div className="mt-5">
                            {selectedRoomIsMember ? (
                                <>
                                    <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">You are a member of this room.</p>
                                    <h3 className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Members</h3>
                                    {participantsRoomId === selectedRoom.id && participants.length > 0 ? (
                                        <ul className="mt-3 space-y-2">
                                            {participants.map((participant) => (
                                                <li key={participant.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2">
                                                    <ProfileAvatar avatarUrl={participant.avatarUrl} label={participant.displayName || participant.username} className="size-9" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-sm text-white">{participant.displayName || participant.username}</span>
                                                        <span className="block truncate text-xs text-zinc-500">@{participant.username}</span>
                                                    </span>
                                                    <span className="text-xs text-zinc-500">{participant.role.toLowerCase()}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="mt-3 text-sm text-zinc-500">Loading room members…</p>
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
        </main>
    );
}