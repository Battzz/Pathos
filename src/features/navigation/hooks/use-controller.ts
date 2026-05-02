import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { closeAllTerminalsForWorkspace } from "@/features/inspector/terminal-store";
import {
	addRepositoryFromLocalPath,
	assignRepoToSpace,
	cloneRepositoryFromUrl,
	createChatSessionInRepo,
	createGenericChatSession,
	deleteProjectChats,
	deleteRepository,
	deleteSession,
	loadAddRepositoryDefaults,
	pinSession,
	type RepositoryFolder,
	type RepositoryFolderChat,
	unpinSession,
	type WorkspaceDetail,
	type WorkspaceSessionSummary,
} from "@/lib/api";
import {
	genericChatsQueryOptions,
	pathosQueryKeys,
	repositoryFoldersQueryOptions,
	sessionThreadMessagesQueryOptions,
	workspaceDetailQueryOptions,
	workspaceSessionsQueryOptions,
} from "@/lib/query-client";
import { describeUnknownError } from "@/lib/workspace-helpers";

const STORAGE_KEY = "pathos:sidebar:folder-collapse-v1";

type CollapseState = Record<string, boolean>;
type AddRepositoryPhase = "idle" | "picking" | "importing";

type WorkspaceToastFn = (
	description: string,
	title?: string,
	variant?: "default" | "destructive",
) => void;

type Args = {
	selectedWorkspaceId: string | null;
	activeSpaceId: string;
	onSelectWorkspace: (workspaceId: string | null) => void;
	onSelectChat: (workspaceId: string, sessionId: string) => void;
	pushWorkspaceToast: WorkspaceToastFn;
};

function seedCreatedChatQueries({
	folder,
	queryClient,
	sessionId,
	workspaceId,
}: {
	folder: RepositoryFolder | undefined;
	queryClient: ReturnType<typeof useQueryClient>;
	sessionId: string;
	workspaceId: string;
}) {
	const now = new Date().toISOString();
	const session: WorkspaceSessionSummary = {
		id: sessionId,
		workspaceId,
		title: "Untitled",
		agentType: null,
		status: "idle",
		model: null,
		permissionMode: "default",
		providerSessionId: null,
		effortLevel: null,
		unreadCount: 0,
		fastMode: false,
		createdAt: now,
		updatedAt: now,
		lastUserMessageAt: null,
		isHidden: false,
		pinnedAt: null,
		actionKind: null,
		active: true,
	};

	queryClient.setQueryData(
		pathosQueryKeys.workspaceSessions(workspaceId),
		(current: WorkspaceSessionSummary[] | undefined) => {
			if ((current ?? []).some((existing) => existing.id === sessionId)) {
				return current;
			}

			return [
				...(current ?? []).map((existing) => ({
					...existing,
					active: false,
				})),
				session,
			];
		},
	);

	queryClient.setQueryData<WorkspaceDetail | null>(
		pathosQueryKeys.workspaceDetail(workspaceId),
		(current) => {
			const base =
				current ??
				(folder
					? {
							id: workspaceId,
							title: folder.repoName,
							repoId: folder.repoId,
							repoName: folder.repoName,
							repoIconSrc: folder.repoIconSrc ?? null,
							repoInitials: folder.repoInitials,
							defaultBranch: folder.defaultBranch ?? null,
							rootPath: folder.rootPath ?? null,
							directoryName: folder.repoName,
							kind: "project" as const,
							state: "ready" as const,
							hasUnread: false,
							workspaceUnread: 0,
							unreadSessionCount: 0,
							status: "in-progress" as const,
							sessionCount: 0,
							messageCount: 0,
							isGit: folder.isGit,
						}
					: null);

			if (!base) {
				return base;
			}

			return {
				...base,
				activeSessionId: sessionId,
				activeSessionTitle: session.title,
				activeSessionAgentType: session.agentType,
				activeSessionStatus: session.status,
				sessionCount: Math.max(base.sessionCount, 1),
			};
		},
	);

	queryClient.setQueryData(
		[...pathosQueryKeys.sessionMessages(sessionId), "thread"],
		[],
	);
}

function readCollapseState(): CollapseState {
	if (typeof window === "undefined") {
		return {};
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}
		const parsed = JSON.parse(raw);
		return typeof parsed === "object" && parsed !== null
			? (parsed as CollapseState)
			: {};
	} catch {
		return {};
	}
}

function writeCollapseState(state: CollapseState) {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// localStorage full / disabled — silently ignore. The collapse
		// state is purely a presentation nicety, not durable data.
	}
}

export function useFolderSidebarController({
	selectedWorkspaceId,
	activeSpaceId,
	onSelectWorkspace,
	onSelectChat,
	pushWorkspaceToast,
}: Args) {
	const queryClient = useQueryClient();
	const foldersQuery = useQuery(repositoryFoldersQueryOptions());
	const folders: RepositoryFolder[] = foldersQuery.data ?? [];
	const genericChatsQuery = useQuery(genericChatsQueryOptions());
	const genericChats: RepositoryFolderChat[] = genericChatsQuery.data ?? [];

	const [addRepositoryPhase, setAddRepositoryPhase] =
		useState<AddRepositoryPhase>("idle");
	const [recentlyAddedRepoId, setRecentlyAddedRepoId] = useState<string | null>(
		null,
	);
	const [creatingChatRepoId, setCreatingChatRepoId] = useState<string | null>(
		null,
	);
	const [creatingGenericChat, setCreatingGenericChat] = useState(false);
	const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
	const [cloneDefaultDirectory, setCloneDefaultDirectory] = useState<
		string | null
	>(null);

	const [collapseState, setCollapseState] = useState<CollapseState>(() =>
		readCollapseState(),
	);

	useEffect(() => {
		writeCollapseState(collapseState);
	}, [collapseState]);

	useEffect(() => {
		if (!recentlyAddedRepoId) {
			return;
		}
		const timeout = window.setTimeout(() => {
			setRecentlyAddedRepoId(null);
		}, 1400);
		return () => window.clearTimeout(timeout);
	}, [recentlyAddedRepoId]);

	// Auto-expand the folder containing the selected workspace once when
	// the selection changes. Stored in a ref so subsequent refetches don't
	// re-expand a folder the user has explicitly collapsed.
	const lastAutoExpandedRef = useRef<string | null>(null);
	useEffect(() => {
		if (
			!selectedWorkspaceId ||
			selectedWorkspaceId === lastAutoExpandedRef.current
		) {
			return;
		}
		const folder = folders.find((f) =>
			f.chats.some((c) => c.workspaceId === selectedWorkspaceId),
		);
		if (!folder) {
			return;
		}
		lastAutoExpandedRef.current = selectedWorkspaceId;
		setCollapseState((current) =>
			current[folder.repoId] === false
				? { ...current, [folder.repoId]: true }
				: current,
		);
	}, [selectedWorkspaceId, folders]);

	const toggleFolder = useCallback((repoId: string) => {
		setCollapseState((current) => {
			const expanded = current[repoId] !== false;
			return { ...current, [repoId]: !expanded };
		});
	}, []);

	const isFolderExpanded = useCallback(
		(repoId: string) => collapseState[repoId] !== false,
		[collapseState],
	);

	const refetchFolders = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: pathosQueryKeys.repositoryFolders,
		});
		void queryClient.invalidateQueries({
			queryKey: pathosQueryKeys.repositories,
		});
		void queryClient.invalidateQueries({
			queryKey: pathosQueryKeys.workspaceGroups,
		});
	}, [queryClient]);

	const handleAddRepository = useCallback(async () => {
		if (addRepositoryPhase !== "idle") {
			return;
		}
		setAddRepositoryPhase("picking");
		try {
			const defaults = await loadAddRepositoryDefaults();
			setCloneDefaultDirectory(defaults.lastCloneDirectory ?? null);
			const selection = await open({
				directory: true,
				multiple: false,
				defaultPath: defaults.lastCloneDirectory ?? undefined,
			});
			const selectedPath = Array.isArray(selection) ? selection[0] : selection;
			if (!selectedPath) {
				return;
			}
			setAddRepositoryPhase("importing");
			const response = await addRepositoryFromLocalPath(selectedPath);
			await assignRepoToSpace(response.repositoryId, activeSpaceId);
			refetchFolders();
			if (!response.createdRepository) {
				pushWorkspaceToast(
					"This project is already in your sidebar.",
					"Already added",
					"default",
				);
			}
			// Auto-expand the folder we just imported so the user can see
			// the empty state with the New chat CTA.
			setCollapseState((current) => ({
				...current,
				[response.repositoryId]: true,
			}));
			if (response.createdRepository) {
				setRecentlyAddedRepoId(response.repositoryId);
			}
		} catch (error) {
			pushWorkspaceToast(
				describeUnknownError(error, "Unable to add project."),
				"Add project failed",
				"destructive",
			);
		} finally {
			setAddRepositoryPhase("idle");
		}
	}, [activeSpaceId, addRepositoryPhase, pushWorkspaceToast, refetchFolders]);

	const handleOpenCloneDialog = useCallback(() => {
		setIsCloneDialogOpen(true);
		void loadAddRepositoryDefaults()
			.then((defaults) => {
				setCloneDefaultDirectory(defaults.lastCloneDirectory ?? null);
			})
			.catch(() => {
				/* dialog still works without a default */
			});
	}, []);

	const handleCloneFromUrl = useCallback(
		async (args: { gitUrl: string; cloneDirectory: string }) => {
			const response = await cloneRepositoryFromUrl(args);
			await assignRepoToSpace(response.repositoryId, activeSpaceId);
			refetchFolders();
			setCloneDefaultDirectory(args.cloneDirectory);
			setCollapseState((current) => ({
				...current,
				[response.repositoryId]: true,
			}));
		},
		[activeSpaceId, refetchFolders],
	);

	const createChatMutation = useMutation({
		mutationFn: async (repoId: string) => {
			setCreatingChatRepoId(repoId);
			try {
				return await createChatSessionInRepo(repoId);
			} finally {
				setCreatingChatRepoId(null);
			}
		},
		onSuccess: (response, repoId) => {
			seedCreatedChatQueries({
				folder: folders.find((folder) => folder.repoId === repoId),
				queryClient,
				sessionId: response.sessionId,
				workspaceId: response.workspaceId,
			});
			refetchFolders();
			setCollapseState((current) => ({ ...current, [repoId]: true }));
			onSelectChat(response.workspaceId, response.sessionId);
		},
		onError: (error) => {
			pushWorkspaceToast(
				describeUnknownError(error, "Unable to start chat."),
				"New chat failed",
				"destructive",
			);
		},
	});

	const createGenericChatMutation = useMutation({
		mutationFn: async () => {
			setCreatingGenericChat(true);
			try {
				return await createGenericChatSession();
			} finally {
				setCreatingGenericChat(false);
			}
		},
		onSuccess: (response) => {
			seedCreatedChatQueries({
				folder: undefined,
				queryClient,
				sessionId: response.sessionId,
				workspaceId: response.workspaceId,
			});
			const now = new Date().toISOString();
			queryClient.setQueryData<RepositoryFolderChat[] | undefined>(
				pathosQueryKeys.genericChats,
				(current) => {
					if (
						(current ?? []).some(
							(chat) => chat.sessionId === response.sessionId,
						)
					) {
						return current;
					}
					return [
						{
							sessionId: response.sessionId,
							workspaceId: response.workspaceId,
							title: "Untitled",
							agentType: null,
							status: "idle",
							unreadCount: 0,
							needsPlanImplementation: false,
							pinnedAt: null,
							createdAt: now,
							updatedAt: now,
							lastUserMessageAt: null,
						},
						...(current ?? []),
					];
				},
			);
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.genericChats,
			});
			onSelectChat(response.workspaceId, response.sessionId);
		},
		onError: (error) => {
			pushWorkspaceToast(
				describeUnknownError(error, "Unable to start chat."),
				"New chat failed",
				"destructive",
			);
		},
	});

	const handleCreateChat = useCallback(
		(repoId: string) => {
			createChatMutation.mutate(repoId);
		},
		[createChatMutation],
	);

	const handleCreateGenericChat = useCallback(() => {
		createGenericChatMutation.mutate();
	}, [createGenericChatMutation]);

	const handleDeleteChat = useCallback(
		async (sessionId: string) => {
			try {
				await deleteSession(sessionId);
				refetchFolders();
				void queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.genericChats,
				});
				if (
					selectedWorkspaceId &&
					genericChats.some(
						(chat) =>
							chat.sessionId === sessionId &&
							chat.workspaceId === selectedWorkspaceId,
					)
				) {
					onSelectWorkspace(null);
				}
			} catch (error) {
				pushWorkspaceToast(
					describeUnknownError(error, "Unable to delete chat."),
					"Delete failed",
					"destructive",
				);
			}
		},
		[
			genericChats,
			onSelectWorkspace,
			pushWorkspaceToast,
			queryClient,
			refetchFolders,
			selectedWorkspaceId,
		],
	);

	const handleDeleteProjectChats = useCallback(
		async (repoId: string) => {
			const folder = folders.find((f) => f.repoId === repoId);
			try {
				const response = await deleteProjectChats(repoId);
				if (
					response.workspaceId &&
					response.workspaceId === selectedWorkspaceId
				) {
					onSelectWorkspace(null);
				}
				refetchFolders();
				if (response.workspaceId) {
					void queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.workspaceDetail(response.workspaceId),
					});
					void queryClient.invalidateQueries({
						queryKey: pathosQueryKeys.workspaceSessions(response.workspaceId),
					});
				}
			} catch (error) {
				pushWorkspaceToast(
					describeUnknownError(error, "Unable to remove project chats."),
					`Remove chats failed${folder ? ` in ${folder.repoName}` : ""}`,
					"destructive",
				);
			}
		},
		[
			folders,
			onSelectWorkspace,
			pushWorkspaceToast,
			queryClient,
			refetchFolders,
			selectedWorkspaceId,
		],
	);

	const refetchPinnedLists = useCallback(
		(workspaceId: string | null) => {
			refetchFolders();
			void queryClient.invalidateQueries({
				queryKey: pathosQueryKeys.genericChats,
			});
			if (workspaceId) {
				void queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceDetail(workspaceId),
				});
				void queryClient.invalidateQueries({
					queryKey: pathosQueryKeys.workspaceSessions(workspaceId),
				});
			}
		},
		[queryClient, refetchFolders],
	);

	const handleToggleChatPin = useCallback(
		async (chat: {
			sessionId: string;
			workspaceId: string;
			pinnedAt?: string | null;
		}) => {
			try {
				if (chat.pinnedAt) {
					await unpinSession(chat.sessionId);
				} else {
					await pinSession(chat.sessionId);
				}
				refetchPinnedLists(chat.workspaceId);
			} catch (error) {
				pushWorkspaceToast(
					describeUnknownError(error, "Unable to update chat pin."),
					"Pin failed",
					"destructive",
				);
			}
		},
		[pushWorkspaceToast, refetchPinnedLists],
	);

	const handleRemoveProject = useCallback(
		async (repoId: string) => {
			// Tear down any running terminals across this repo's workspaces.
			const folder = folders.find((f) => f.repoId === repoId);
			if (folder) {
				for (const workspace of folder.workspaces) {
					closeAllTerminalsForWorkspace(workspace.id);
				}
			}
			try {
				await deleteRepository(repoId);
				if (
					selectedWorkspaceId &&
					folder?.workspaces.some((w) => w.id === selectedWorkspaceId)
				) {
					onSelectWorkspace(null);
				}
				if (
					selectedWorkspaceId &&
					folder?.chats.some((c) => c.workspaceId === selectedWorkspaceId)
				) {
					onSelectWorkspace(null);
				}
				refetchFolders();
			} catch (error) {
				pushWorkspaceToast(
					describeUnknownError(error, "Unable to remove project."),
					"Remove project failed",
					"destructive",
				);
			}
		},
		[
			folders,
			onSelectWorkspace,
			pushWorkspaceToast,
			refetchFolders,
			selectedWorkspaceId,
		],
	);

	const prefetchChat = useCallback(
		(workspaceId: string, sessionId: string) => {
			void queryClient.prefetchQuery(workspaceDetailQueryOptions(workspaceId));
			void queryClient.prefetchQuery(
				workspaceSessionsQueryOptions(workspaceId),
			);
			void queryClient.prefetchQuery(
				sessionThreadMessagesQueryOptions(sessionId),
			);
		},
		[queryClient],
	);

	return {
		folders,
		genericChats,
		isLoadingFolders: foldersQuery.isLoading,
		addingRepository: addRepositoryPhase !== "idle",
		importingRepository: addRepositoryPhase === "importing",
		recentlyAddedRepoId,
		creatingChatRepoId,
		creatingGenericChat,
		isCloneDialogOpen,
		setIsCloneDialogOpen,
		cloneDefaultDirectory,
		isFolderExpanded,
		toggleFolder,
		handleAddRepository,
		handleOpenCloneDialog,
		handleCloneFromUrl,
		handleCreateChat,
		handleCreateGenericChat,
		handleDeleteChat,
		handleDeleteProjectChats,
		handleToggleChatPin,
		handleRemoveProject,
		prefetchChat,
	};
}
