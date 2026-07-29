import React from 'react';
import { Button, H3, Icon, Position, Text, Tooltip } from '@blueprintjs/core';
import { createStyles, makeStyles } from '@material-ui/core/styles';
import SettingsOverlay from './SettingsOverlay/SettingsOverlay';
import ConnectedDevicesListDrawer from './ConnectedDevicesListDrawer';
import { useTranslation } from 'react-i18next';
import { IpcEvents } from '../../../common/IpcEvents.enum';

const useStyles = makeStyles(() =>
	createStyles({
		topPanelRoot: {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'space-between',
			gap: '20px',
			boxSizing: 'border-box',
			width: 'calc(100% - 32px)',
			maxWidth: '1120px',
			minHeight: '76px',
			margin: '16px auto 20px',
			padding: '14px 18px',
			background: 'rgba(255, 255, 255, 0.9)',
			border: '1px solid rgba(16, 107, 163, 0.12)',
			borderRadius: '18px',
			boxShadow: '0 12px 36px rgba(41, 55, 66, 0.1)',
			backdropFilter: 'blur(14px)',
			'@media (max-width: 680px)': {
				alignItems: 'stretch',
				flexDirection: 'column',
				width: 'calc(100% - 20px)',
				marginTop: '10px',
			},
		},
		brandGroup: {
			display: 'flex',
			alignItems: 'center',
			gap: '12px',
			minWidth: 0,
		},
		brandMark: {
			display: 'grid',
			placeItems: 'center',
			width: '46px',
			height: '46px',
			flexShrink: 0,
			color: '#ffffff',
			background: 'linear-gradient(135deg, #0d8bd9 0%, #13b98a 100%)',
			borderRadius: '14px',
			boxShadow: '0 7px 18px rgba(13, 139, 217, 0.24)',
		},
		brandCopy: { minWidth: 0 },
		title: {
			margin: 0,
			fontSize: '19px',
			lineHeight: 1.25,
			color: '#182026',
		},
		subtitle: {
			display: 'block',
			marginTop: '3px',
			color: '#738694',
			fontSize: '12px',
			whiteSpace: 'nowrap',
			overflow: 'hidden',
			textOverflow: 'ellipsis',
		},
		controls: {
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'flex-end',
			gap: '8px',
			flexWrap: 'wrap',
			'@media (max-width: 680px)': { justifyContent: 'center' },
		},
		controlButton: {
			width: '42px',
			height: '42px',
			borderRadius: '13px',
		},
		deviceButtonWrapper: { position: 'relative' },
		connectedDevicesBadge: {
			position: 'absolute',
			top: '-5px',
			right: '-5px',
			display: 'grid',
			placeItems: 'center',
			minWidth: '20px',
			height: '20px',
			padding: '0 5px',
			boxSizing: 'border-box',
			color: '#ffffff',
			background: '#e5484d',
			border: '2px solid #ffffff',
			borderRadius: '999px',
			fontSize: '11px',
			fontWeight: 700,
		},
	}),
);

interface Props {
	handleReset: () => void;
}

export default function TopPanel({ handleReset }: Props): React.ReactElement {
	const { t } = useTranslation();
	const classes = useStyles();
	const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
	const [isConnectedDevicesDrawerOpen, setIsConnectedDevicesDrawerOpen] =
		React.useState(false);
	const [connectedDevicesCount, setConnectedDevicesCount] = React.useState(0);

	React.useEffect(() => {
		const fetchConnectedDevicesCount = async (): Promise<void> => {
			try {
				const devices = await window.electron.ipcRenderer.invoke(
					IpcEvents.GetConnectedDevices,
				);
				setConnectedDevicesCount(Array.isArray(devices) ? devices.length : 0);
			} catch (error) {
				console.error('Failed to load connected devices', error);
			}
		};
		void fetchConnectedDevicesCount();
		const interval = window.setInterval(fetchConnectedDevicesCount, 2000);
		return () => window.clearInterval(interval);
	}, []);

	const openTutorial = React.useCallback(() => {
		void window.electron.ipcRenderer.invoke(
			IpcEvents.OpenExternalLink,
			'https://deskreen.com/howto',
		);
	}, []);

	const repairSession = React.useCallback(() => {
		Promise.resolve(handleReset()).then(() => {
			void window.electron.ipcRenderer.invoke(
				IpcEvents.CreateWaitingForConnectionSharingSession,
			);
		});
	}, [handleReset]);

	return (
		<>
			<header className={classes.topPanelRoot}>
				<div className={classes.brandGroup}>
					<div className={classes.brandMark} aria-hidden="true">
						<Icon icon="desktop" size={23} color="#ffffff" />
					</div>
					<div className={classes.brandCopy}>
						<H3 className={classes.title}>Deskreen Community Edition</H3>
						<Text className={classes.subtitle}>
							Private screen sharing on your local network
						</Text>
					</div>
				</div>
				<nav className={classes.controls} aria-label="Deskreen controls">
					<div className={classes.deviceButtonWrapper}>
						<Tooltip
							content={t('connected-devices')}
							position={Position.BOTTOM}
						>
							<Button
								id="top-panel-connected-devices-list-button"
								intent="primary"
								icon="th-list"
								className={classes.controlButton}
								onClick={() =>
									setIsConnectedDevicesDrawerOpen((isOpen) => !isOpen)
								}
							/>
						</Tooltip>
						{connectedDevicesCount > 0 && (
							<span className={classes.connectedDevicesBadge}>
								{connectedDevicesCount}
							</span>
						)}
					</div>
					<Tooltip content={t('fix-reset-tooltip')} position={Position.BOTTOM}>
						<Button
							id="top-panel-help-button"
							intent="danger"
							icon="lifesaver"
							className={classes.controlButton}
							onClick={repairSession}
						/>
					</Tooltip>
					<Tooltip content={t('tutorial')} position={Position.BOTTOM}>
						<Button
							id="top-panel-tutorial-button"
							icon="learning"
							className={classes.controlButton}
							onClick={openTutorial}
						/>
					</Tooltip>
					<Tooltip content={t('settings')} position={Position.BOTTOM}>
						<Button
							id="top-panel-settings-button"
							icon="cog"
							className={classes.controlButton}
							onClick={() => setIsSettingsOpen(true)}
						/>
					</Tooltip>
				</nav>
			</header>
			{isSettingsOpen && (
				<SettingsOverlay
					isSettingsOpen={isSettingsOpen}
					handleClose={() => setIsSettingsOpen(false)}
				/>
			)}
			{isConnectedDevicesDrawerOpen && (
				<ConnectedDevicesListDrawer
					isOpen={isConnectedDevicesDrawerOpen}
					handleToggle={() => setIsConnectedDevicesDrawerOpen(false)}
					handleReset={handleReset}
				/>
			)}
		</>
	);
}
