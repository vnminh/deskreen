import { useCallback, useEffect, useState } from 'react';
import {
	Alignment,
	Button,
	ButtonGroup,
	Card,
	Classes,
	Divider,
	H5,
	Popover,
	Position,
	Switch,
	Text,
	Tooltip,
} from '@blueprintjs/core';
import screenfull from 'screenfull';
import { useTranslation } from 'react-i18next';
import FullScreenEnter from '../../images/fullscreen_24px.svg';
import FullScreenExit from '../../images/fullscreen_exit-24px.svg';
import {
	VideoQuality,
	type VideoQualityType,
} from '../../features/VideoAutoQualityOptimizer/VideoQualityEnum';
import { handlePlayerToggleFullscreen } from './handlePlayerToggleFullscreen';
import initScreenfullOnChange from './initScreenfullOnChange';
import { ScreenSharingSource } from '../../features/PeerConnection/ScreenSharingSourceEnum';
import './index.css';

interface PlayerControlPanelProps {
	onSwitchChangedCallback: (isEnabled: boolean) => void;
	isPlaying: boolean;
	isDefaultPlayerTurnedOn: boolean;
	handleClickFullscreen: () => 'entered' | 'exited' | 'failed';
	handleClickPlayPause: () => void;
	setVideoQuality: (q: VideoQualityType) => void;
	selectedVideoQuality: VideoQualityType;
	screenSharingSourceType: ScreenSharingSourceType;
	isRemoteControlAllowed: boolean;
	isRemoteControlActive: boolean;
	onRemoteControlToggle: () => void;
}

function PlayerControlPanel(props: PlayerControlPanelProps) {
	const { t } = useTranslation();
	const {
		onSwitchChangedCallback,
		isPlaying,
		isDefaultPlayerTurnedOn,
		handleClickPlayPause,
		handleClickFullscreen,
		selectedVideoQuality,
		setVideoQuality,
		screenSharingSourceType,
		isRemoteControlAllowed,
		isRemoteControlActive,
		onRemoteControlToggle,
	} = props;
	const [isFullScreenOn, setIsFullScreenOn] = useState(false);
	const isFullScreenAPIAvailable = screenfull.isEnabled;

	useEffect(() => initScreenfullOnChange(setIsFullScreenOn), []);

	const toggleDefaultPlayerFullscreen = useCallback(() => {
		const result = handlePlayerToggleFullscreen();
		if (result !== 'failed') setIsFullScreenOn(result === 'entered');
		return result;
	}, []);

	const handleFullscreen = useCallback(() => {
		const result = isDefaultPlayerTurnedOn
			? toggleDefaultPlayerFullscreen()
			: handleClickFullscreen();
		if (result === 'failed') console.warn('Unable to toggle fullscreen');
	}, [
		handleClickFullscreen,
		isDefaultPlayerTurnedOn,
		toggleDefaultPlayerFullscreen,
	]);

	const remoteControlTooltip = isRemoteControlAllowed
		? isRemoteControlActive
			? t('Stop controlling the shared screen')
			: t('Control the shared screen')
		: t('The host must allow remote control');

	return (
		<Card elevation={3} className="viewer-control-panel">
			<div className="viewer-toolbar">
				<div className="viewer-brand" aria-label="Deskreen Viewer">
					<img src="/img/logo512.png" alt="" className="viewer-brand-logo" />
					<div className="viewer-brand-copy">
						<Text className="viewer-brand-title">Deskreen Viewer</Text>
						<Text className="viewer-brand-subtitle">Local secure session</Text>
					</div>
				</div>

				<ButtonGroup
					className="viewer-control-group"
					aria-label="Player controls"
				>
					<Tooltip
						content={
							isPlaying ? t('Click to Pause Video') : t('Click to Play Video')
						}
						position={Position.BOTTOM}
					>
						<Button
							minimal
							icon={isPlaying ? 'pause' : 'play'}
							className="viewer-control-button viewer-play-button"
							onClick={handleClickPlayPause}
						>
							<span className="viewer-control-label">
								{isPlaying ? t('Pause') : t('Play')}
							</span>
						</Button>
					</Tooltip>

					<Popover
						position={Position.BOTTOM}
						popoverClassName={Classes.POPOVER_CONTENT_SIZING}
						content={
							<div className="viewer-quality-menu">
								<H5>{t('Video Settings')}</H5>
								<Divider />
								{Object.values(VideoQuality).map(
									(quality: VideoQualityType) => (
										<Button
											key={quality}
											minimal
											active={selectedVideoQuality === quality}
											disabled={
												screenSharingSourceType === ScreenSharingSource.WINDOW
											}
											onClick={() => setVideoQuality(quality)}
										>
											{quality}
										</Button>
									),
								)}
							</div>
						}
					>
						<Tooltip
							content={t('Click to Open Video Settings')}
							position={Position.BOTTOM}
						>
							<Button
								minimal
								icon="cog"
								className="viewer-control-button"
								aria-label={t('Video Settings')}
							/>
						</Tooltip>
					</Popover>

					<Tooltip content={remoteControlTooltip} position={Position.BOTTOM}>
						<Button
							minimal
							icon="hand"
							disabled={!isRemoteControlAllowed}
							active={isRemoteControlActive}
							onClick={onRemoteControlToggle}
							className={`viewer-control-button viewer-remote-button${
								isRemoteControlActive ? ' is-active' : ''
							}`}
							aria-label={t('Remote control')}
						/>
					</Tooltip>

					<Tooltip
						content={t('Click to Enter Full Screen Mode')}
						position={Position.BOTTOM}
					>
						<Button
							minimal
							className="viewer-control-button"
							onClick={handleFullscreen}
							aria-label={t('Click to Enter Full Screen Mode')}
						>
							<img
								src={isFullScreenOn ? FullScreenExit : FullScreenEnter}
								width={18}
								height={18}
								className="viewer-fullscreen-icon"
								alt=""
							/>
						</Button>
					</Tooltip>
				</ButtonGroup>

				<Switch
					className="viewer-player-switch"
					onChange={() => onSwitchChangedCallback(!isDefaultPlayerTurnedOn)}
					innerLabel={isDefaultPlayerTurnedOn ? t('ON') : t('OFF')}
					label={t('Default Video Player')}
					alignIndicator={Alignment.RIGHT}
					checked={isDefaultPlayerTurnedOn}
					disabled={!isFullScreenAPIAvailable}
				/>
			</div>
		</Card>
	);
}

export default PlayerControlPanel;
