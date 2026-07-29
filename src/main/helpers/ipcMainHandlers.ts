import {
	Display,
	ipcMain,
	BrowserWindow,
	screen,
	clipboard,
	shell,
	app,
} from 'electron';
import i18n from '../configs/i18next.config';
import { ConnectedDevicesService } from '../../features/ConnectedDevicesService';
import SharingSession from '../../features/SharingSessionService/SharingSession';
import RoomIDService from '../../server/RoomIDService';
import { signalingServer } from '../../server';
import { onDeviceConnectedCallback } from '../../server/onDeviceConnectedCallback';
import SharingSessionStatusEnum from '../../features/SharingSessionService/SharingSessionStatusEnum';
import getMyLocalIpV4 from './getMyLocalIpV4';
import isWifiConnected from './isWifiConnected';
import { getDeskreenGlobal } from './getDeskreenGlobal';
import { IpcEvents } from '../../common/IpcEvents.enum';
import { ElectronStoreKeys } from '../../common/ElectronStoreKeys.enum';
import { store } from '../../common/deskreen-electron-store';
import DesktopCapturerSourceType from '../../common/DesktopCapturerSourceType';
import isLinuxWaylandSession from '../utils/isLinuxWaylandSession';
import { checkScreenRecordingPermission } from './checkScreenRecordingPermission';
import RemoteControlService from '../services/RemoteControlService';
import type { RemoteControlInput } from '../../common/RemoteControl';
import { getUsbTetherNetwork } from './getMyLocalIpV4';

export const initIpcMainHandlers = (mainWindow: BrowserWindow): void => {
	const remoteControlService = new RemoteControlService();

	const getSharingSessionForWebContentsId = (webContentsId: number) => {
		return [
			...getDeskreenGlobal().sharingSessionService.sharingSessions.values(),
		].find(
			(session) =>
				session.peerConnectionHelperRenderer?.webContents.id === webContentsId,
		);
	};

	const remoteControlDisplayCache = new Map<
		string,
		{ sourceId: string; display: Display }
	>();

	const resolveRemoteControlDisplay = (
		session: SharingSession,
	): Display | undefined => {
		const cached = remoteControlDisplayCache.get(session.id);
		if (cached?.sourceId === session.desktopCapturerSourceID) {
			return cached.display;
		}

		const sourcesService = getDeskreenGlobal().desktopCapturerSourcesService;
		const displays = screen.getAllDisplays();
		const sourceDisplayId =
			sourcesService.getSourceDisplayIDByDisplayCapturerSourceID(
				session.desktopCapturerSourceID,
			);
		let display = displays.find(
			(candidate) => `${candidate.id}` === sourceDisplayId,
		);

		if (!display && displays.length === 1) {
			[display] = displays;
		}

		if (!display) {
			const sourceIndex = sourcesService
				.getScreenSources()
				.findIndex((source) => source.id === session.desktopCapturerSourceID);
			if (sourceIndex >= 0 && sourceIndex < displays.length) {
				display = displays[sourceIndex];
			}
		}

		if (!display) {
			console.error('Unable to resolve remote control display', {
				sourceId: session.desktopCapturerSourceID,
				sourceDisplayId,
				displayIds: displays.map((candidate) => `${candidate.id}`),
			});
			return undefined;
		}

		if (`${display.id}` !== sourceDisplayId) {
			console.warn('Using remote control display fallback', {
				sourceId: session.desktopCapturerSourceID,
				sourceDisplayId,
				displayId: `${display.id}`,
			});
		}
		remoteControlDisplayCache.set(session.id, {
			sourceId: session.desktopCapturerSourceID,
			display,
		});
		return display;
	};

	ipcMain.on('client-changed-language', async (_, newLangCode) => {
		i18n.changeLanguage(newLangCode);
		if (store.has(ElectronStoreKeys.AppLanguage)) {
			if (store.get(ElectronStoreKeys.AppLanguage) === newLangCode) {
				return;
			}
			store.delete(ElectronStoreKeys.AppLanguage);
		}
		store.set(ElectronStoreKeys.AppLanguage, newLangCode);
	});

	ipcMain.handle('get-signaling-server-port', () => {
		if (mainWindow === null) return;
		mainWindow.webContents.send('sending-port-from-main', signalingServer.port);
	});

	ipcMain.handle('get-all-displays', () => {
		return screen.getAllDisplays();
	});

	ipcMain.handle('get-display-size-by-display-id', (_, displayID: string) => {
		const display = screen.getAllDisplays().find((d: Display) => {
			return `${d.id}` === displayID;
		});

		if (display) {
			return display.size;
		}
		return undefined;
	});

	ipcMain.handle(IpcEvents.GetIsLinuxWaylandSession, () => {
		return isLinuxWaylandSession;
	});

	ipcMain.handle(
		IpcEvents.RequestDesktopCapturerPortalSource,
		async (_, { mode }: { mode: 'screen' | 'window' }) => {
			const types =
				mode === 'window'
					? [DesktopCapturerSourceType.WINDOW]
					: [DesktopCapturerSourceType.SCREEN];

			if (!isLinuxWaylandSession) {
				await getDeskreenGlobal().desktopCapturerSourcesService.refreshDesktopCapturerSources();
				if (mode === 'window') {
					const sources =
						getDeskreenGlobal().desktopCapturerSourcesService.getAppWindowSources();
					return sources[0]?.id ?? null;
				}
				const sources =
					getDeskreenGlobal().desktopCapturerSourcesService.getScreenSources();
				return sources[0]?.id ?? null;
			}

			const source =
				await getDeskreenGlobal().desktopCapturerSourcesService.requestPortalSource(
					types,
				);
			return source?.id ?? null;
		},
	);

	ipcMain.handle('main-window-onbeforeunload', () => {
		const deskreenGlobal = getDeskreenGlobal();
		deskreenGlobal.connectedDevicesService = new ConnectedDevicesService();
		deskreenGlobal.roomIDService = new RoomIDService();
		deskreenGlobal.sharingSessionService.sharingSessions.forEach(
			(sharingSession: SharingSession) => {
				sharingSession.denyConnectionForPartner();
				sharingSession.destroy();
			},
		);

		deskreenGlobal.rendererWebrtcHelpersService.helpers.forEach(
			(helperWindow) => {
				helperWindow.close();
			},
		);

		deskreenGlobal.sharingSessionService.waitingForConnectionSharingSession =
			null;
		deskreenGlobal.rendererWebrtcHelpersService.helpers.clear();
		deskreenGlobal.sharingSessionService.sharingSessions.clear();
	});

	ipcMain.handle('get-latest-version', () => {
		return getDeskreenGlobal().latestAppVersion;
	});

	ipcMain.handle('get-current-version', () => {
		return getDeskreenGlobal().currentAppVersion;
	});

	ipcMain.handle('get-local-lan-ip', async () => {
		const deskreenGlobal = getDeskreenGlobal();
		if (deskreenGlobal.cliLocalIp) {
			return deskreenGlobal.cliLocalIp;
		}
		const ip = getMyLocalIpV4();
		return ip;
	});

	ipcMain.handle('check-wifi-connection', async () => {
		return isWifiConnected();
	});

	ipcMain.handle(IpcEvents.GetPort, () => {
		return signalingServer.port;
	});

	ipcMain.handle(IpcEvents.GetAppPath, () => {
		const deskreenGlobal = getDeskreenGlobal();
		return deskreenGlobal.appPath;
	});

	ipcMain.handle(IpcEvents.UnmarkRoomIDAsTaken, (_, roomID) => {
		const deskreenGlobal = getDeskreenGlobal();
		deskreenGlobal.roomIDService.unmarkRoomIDAsTaken(roomID);
	});

	async function createWaitingForConnectionSharingSession(
		roomID?: string,
	): Promise<void> {
		try {
			const deskreenGlobal = getDeskreenGlobal();
			if (
				deskreenGlobal.sharingSessionService
					.waitingForConnectionSharingSession !== null
			) {
				return;
			}
			const waitingSession =
				await deskreenGlobal.sharingSessionService.createWaitingForConnectionSharingSession(
					roomID,
				);
			waitingSession.setOnDeviceConnectedCallback(onDeviceConnectedCallback);
		} catch (error) {
			console.error('Failed to create waiting sharing session', error);
		}
	}

	ipcMain.handle(
		IpcEvents.CreateWaitingForConnectionSharingSession,
		async (_, roomID?: string) => {
			await createWaitingForConnectionSharingSession(roomID);
		},
	);

	function resetWaitingForConnectionSharingSession(): void {
		const sharingSession =
			getDeskreenGlobal().sharingSessionService
				.waitingForConnectionSharingSession;
		const roomID = sharingSession?.roomID;
		sharingSession?.denyConnectionForPartner();
		sharingSession?.disconnectByHostMachineUser();
		sharingSession?.destroy();
		sharingSession?.setStatus(SharingSessionStatusEnum.NOT_CONNECTED);
		getDeskreenGlobal().sharingSessionService.sharingSessions.delete(
			sharingSession?.id as string,
		);
		if (roomID) {
			getDeskreenGlobal().roomIDService.unmarkRoomIDAsTaken(roomID);
		}
		getDeskreenGlobal().sharingSessionService.waitingForConnectionSharingSession =
			null;
	}

	ipcMain.handle(IpcEvents.ResetWaitingForConnectionSharingSession, () => {
		resetWaitingForConnectionSharingSession();
	});

	const removeViewerAvailabilityListener =
		getDeskreenGlobal().connectedDevicesService.addAvailabilityListener(
			(state) => {
				const isAvailable = state === 'available';
				const targetWindow = mainWindow?.isDestroyed() ? null : mainWindow;
				if (targetWindow) {
					targetWindow.webContents.send(
						IpcEvents.ViewerConnectionAvailabilityChanged,
						{
							isAvailable,
						},
					);
				}
				if (isAvailable) {
					void createWaitingForConnectionSharingSession();
				}
			},
		);

	mainWindow.on('closed', () => {
		removeViewerAvailabilityListener();
	});

	ipcMain.handle(IpcEvents.SetDeviceConnectedStatus, () => {
		if (
			getDeskreenGlobal().sharingSessionService
				.waitingForConnectionSharingSession !== null
		) {
			const sharingSession =
				getDeskreenGlobal().sharingSessionService
					.waitingForConnectionSharingSession;
			sharingSession?.setStatus(SharingSessionStatusEnum.CONNECTED);
		}
	});

	ipcMain.handle(
		IpcEvents.GetSourceDisplayIDByDesktopCapturerSourceID,
		(_, sourceId) => {
			return getDeskreenGlobal().desktopCapturerSourcesService.getSourceDisplayIDByDisplayCapturerSourceID(
				sourceId,
			);
		},
	);

	ipcMain.handle(
		IpcEvents.DisconnectPeerAndDestroySharingSessionBySessionID,
		(_, sessionId) => {
			const sharingSession =
				getDeskreenGlobal().sharingSessionService.sharingSessions.get(
					sessionId,
				);
			if (sharingSession) {
				getDeskreenGlobal().connectedDevicesService.disconnectDeviceByID(
					sharingSession.deviceID,
				);
			}
			sharingSession?.disconnectByHostMachineUser();
			sharingSession?.destroy();
			remoteControlDisplayCache.delete(sessionId);
			getDeskreenGlobal().sharingSessionService.sharingSessions.delete(
				sessionId,
			);
		},
	);

	ipcMain.handle(
		IpcEvents.GetDesktopCapturerSourceIdBySharingSessionId,
		(_, sessionId) => {
			return getDeskreenGlobal().sharingSessionService.sharingSessions.get(
				sessionId,
			)?.desktopCapturerSourceID;
		},
	);

	ipcMain.handle(IpcEvents.GetConnectedDevices, () => {
		return getDeskreenGlobal().connectedDevicesService.getDevices();
	});

	ipcMain.handle(IpcEvents.GetViewerConnectionAvailability, () => {
		return getDeskreenGlobal().connectedDevicesService.isSlotAvailable();
	});

	ipcMain.handle(IpcEvents.DisconnectDeviceById, (_, id) => {
		getDeskreenGlobal().connectedDevicesService.disconnectDeviceByID(id);
	});

	ipcMain.handle(IpcEvents.DisconnectAllDevices, () => {
		getDeskreenGlobal().connectedDevicesService.disconnectAllDevices();
	});

	ipcMain.handle(IpcEvents.AppLanguageChanged, (_, newLang) => {
		if (store.has(ElectronStoreKeys.AppLanguage)) {
			store.delete(ElectronStoreKeys.AppLanguage);
		}
		store.set(ElectronStoreKeys.AppLanguage, newLang);
		getDeskreenGlobal().sharingSessionService.sharingSessions.forEach(
			(sharingSession) => {
				sharingSession?.appLanguageChanged();
			},
		);
		i18n.changeLanguage(newLang);
	});

	ipcMain.handle(IpcEvents.GetDesktopCapturerServiceSourcesMap, () => {
		const map =
			getDeskreenGlobal().desktopCapturerSourcesService.getSourcesMap();
		const res = {};

		for (const key of map.keys()) {
			const source = map.get(key);
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			res[key] = {
				source: {
					thumbnail: source?.source.thumbnail?.toDataURL(),
					appIcon: source?.source.appIcon?.toDataURL(),
					name: source?.source.name,
				},
			};
		}
		return res;
	});

	ipcMain.handle(
		IpcEvents.GetDesktopCapturerServiceSourcesByIds,
		(_, ids: string[]) => {
			const map =
				getDeskreenGlobal().desktopCapturerSourcesService.getSourcesMap();
			const res = {};

			ids.forEach((id) => {
				const source = map.get(id);
				if (!source) return;
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore
				res[id] = {
					source: {
						thumbnail: source?.source.thumbnail?.toDataURL(),
						appIcon: source?.source.appIcon?.toDataURL(),
						name: source?.source.name,
					},
				};
			});
			return res;
		},
	);

	ipcMain.handle(
		IpcEvents.GetWaitingForConnectionSharingSessionSourceId,
		() => {
			return getDeskreenGlobal().sharingSessionService
				.waitingForConnectionSharingSession?.desktopCapturerSourceID;
		},
	);

	function startSharingOnWaitingForConnectionSharingSession(): void {
		const deskreenGlobal = getDeskreenGlobal();
		const { connectedDevicesService, sharingSessionService, roomIDService } =
			deskreenGlobal;
		const pendingDevice = connectedDevicesService.pendingConnectionDevice;
		if (!pendingDevice.id) {
			return;
		}

		const sharingSession =
			sharingSessionService.waitingForConnectionSharingSession;
		if (sharingSession !== null) {
			roomIDService.unmarkRoomIDAsTaken(sharingSession.roomID);
		}

		connectedDevicesService.addDevice(pendingDevice);

		if (sharingSession !== null) {
			sharingSession.callPeer();
			sharingSession.setStatus(SharingSessionStatusEnum.SHARING);
			sharingSessionService.waitingForConnectionSharingSession = null;
		}

		connectedDevicesService.resetPendingConnectionDevice();
	}

	ipcMain.handle(
		IpcEvents.StartSharingOnWaitingForConnectionSharingSession,
		() => {
			startSharingOnWaitingForConnectionSharingSession();
		},
	);

	ipcMain.handle(IpcEvents.GetPendingConnectionDevice, () => {
		return getDeskreenGlobal().connectedDevicesService.pendingConnectionDevice;
	});

	ipcMain.handle(IpcEvents.GetWaitingForConnectionSharingSessionRoomId, () => {
		if (
			getDeskreenGlobal().sharingSessionService
				.waitingForConnectionSharingSession === null
		) {
			return undefined;
		}
		return getDeskreenGlobal().sharingSessionService
			.waitingForConnectionSharingSession?.roomID;
	});

	ipcMain.handle(
		IpcEvents.GetDesktopSharingSourceIds,
		async (_, { isEntireScreenToShareChosen }) => {
			if (isLinuxWaylandSession) {
				return [];
			}
			// ensure sources are up to date at request time
			await getDeskreenGlobal().desktopCapturerSourcesService.refreshDesktopCapturerSources();

			if (isEntireScreenToShareChosen === true) {
				return getDeskreenGlobal()
					.desktopCapturerSourcesService.getScreenSources()
					.map((source) => source.id);
			}
			return getDeskreenGlobal()
				.desktopCapturerSourcesService.getAppWindowSources()
				.map((source) => source.id);
		},
	);

	ipcMain.handle(IpcEvents.SetDesktopCapturerSourceId, (_, id) => {
		getDeskreenGlobal().sharingSessionService.waitingForConnectionSharingSession?.setDesktopCapturerSourceID(
			id,
		);
	});

	ipcMain.handle(IpcEvents.GetIsFirstTimeAppStart, () => {
		if (store.has(ElectronStoreKeys.IsNotFirstTimeAppStart)) {
			return false;
		}
		return true;
	});

	ipcMain.handle(IpcEvents.SetAppStartedOnce, () => {
		if (store.has(ElectronStoreKeys.IsNotFirstTimeAppStart)) {
			store.delete(ElectronStoreKeys.IsNotFirstTimeAppStart);
		}
		store.set(ElectronStoreKeys.IsNotFirstTimeAppStart, 'true');
	});

	ipcMain.handle(IpcEvents.GetAppLanguage, () => {
		if (store.has(ElectronStoreKeys.AppLanguage)) {
			return store.get(ElectronStoreKeys.AppLanguage);
		}
		return 'en';
	});

	ipcMain.handle(IpcEvents.DestroySharingSessionById, (_, id) => {
		if (
			getDeskreenGlobal().sharingSessionService
				.waitingForConnectionSharingSession?.id === id
		) {
			getDeskreenGlobal().sharingSessionService.waitingForConnectionSharingSession =
				null;
		}
		const sharingSession =
			getDeskreenGlobal().sharingSessionService.sharingSessions.get(id);
		sharingSession?.setStatus(SharingSessionStatusEnum.DESTROYED);
		sharingSession?.destroy();
		remoteControlDisplayCache.delete(id);
		getDeskreenGlobal().sharingSessionService.sharingSessions.delete(id);
	});

	ipcMain.handle(IpcEvents.OpenExternalLink, (_, url: string) => {
		if (typeof url !== 'string') {
			return;
		}
		shell.openExternal(url);
	});

	ipcMain.handle(IpcEvents.WriteTextToClipboard, (_, text) => {
		clipboard.writeText(text);
	});

	ipcMain.handle(IpcEvents.CheckScreenRecordingPermission, () => {
		return checkScreenRecordingPermission();
	});

	ipcMain.handle(IpcEvents.RelaunchApp, () => {
		app.relaunch();
		app.exit(0);
	});

	ipcMain.handle(
		IpcEvents.GetRemoteControlStatus,
		(event, sharingSessionId: string) => {
			if (event.sender.id !== mainWindow.webContents.id) {
				return { enabled: false, supported: false };
			}
			const session =
				getDeskreenGlobal().sharingSessionService.sharingSessions.get(
					sharingSessionId,
				);
			const isEntireScreen =
				session?.desktopCapturerSourceID.includes(
					DesktopCapturerSourceType.SCREEN,
				) ?? false;
			const supported =
				Boolean(session) && isEntireScreen && !isLinuxWaylandSession;

			return {
				enabled: supported && Boolean(session?.remoteControlEnabled),
				supported,
				reason: isLinuxWaylandSession
					? 'Remote control is not available in a Wayland session.'
					: !isEntireScreen
						? 'Remote control requires sharing an entire screen.'
						: undefined,
			};
		},
	);

	ipcMain.handle(
		IpcEvents.SetRemoteControlEnabled,
		(event, sharingSessionId: string, enabled: boolean) => {
			if (
				event.sender.id !== mainWindow.webContents.id ||
				typeof enabled !== 'boolean'
			) {
				return false;
			}

			const session =
				getDeskreenGlobal().sharingSessionService.sharingSessions.get(
					sharingSessionId,
				);
			const supported =
				Boolean(session) &&
				!isLinuxWaylandSession &&
				Boolean(
					session?.desktopCapturerSourceID.includes(
						DesktopCapturerSourceType.SCREEN,
					),
				);
			if (!session || (enabled && !supported)) return false;

			const helperId = session.peerConnectionHelperRenderer?.webContents.id;
			session.setRemoteControlEnabled(enabled);
			if (!enabled) {
				remoteControlDisplayCache.delete(session.id);
				if (helperId !== undefined) {
					remoteControlService.releaseSession(helperId);
				}
			}
			return session.remoteControlEnabled;
		},
	);

	ipcMain.on(
		IpcEvents.RemoteControlInput,
		(event, input: RemoteControlInput) => {
			const session = getSharingSessionForWebContentsId(event.sender.id);
			if (!session) return;

			if (input?.type === 'release_all') {
				remoteControlService.releaseSession(event.sender.id);
				return;
			}

			if (
				!session.remoteControlEnabled ||
				session.status !== SharingSessionStatusEnum.SHARING ||
				isLinuxWaylandSession ||
				!session.desktopCapturerSourceID.includes(
					DesktopCapturerSourceType.SCREEN,
				)
			) {
				return;
			}

			const display = resolveRemoteControlDisplay(session);
			if (!display) return;

			remoteControlService.handleInput(event.sender.id, display, input);
		},
	);

	ipcMain.handle(IpcEvents.GetUsbTetherNetwork, (event) => {
		if (event.sender.id !== mainWindow.webContents.id) return undefined;
		return getUsbTetherNetwork();
	});

	void createWaitingForConnectionSharingSession();
};
