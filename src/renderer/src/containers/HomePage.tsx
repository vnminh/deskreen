import React, { useCallback, useState } from 'react';
import { Classes } from '@blueprintjs/core';
import { ToastProvider, DefaultToast } from 'react-toast-notifications';

import { LIGHT_UI_BACKGROUND } from './SettingsProvider';
import DeskreenStepper from './DeskreenStepper';
import { Device } from '../../../common/Device';
import TopPanel from '@renderer/components/TopPanel';
import ScreenRecordingPermissionModal from '@renderer/components/ScreenRecordingPermissionModal';
import { IpcEvents } from '../../../common/IpcEvents.enum';
import { useScreenRecordingPermission } from '@renderer/hooks/useScreenRecordingPermission';

// @ts-ignore: it is ok here, be like js it is fine
// eslint-disable-next-line react/prop-types
export const CustomToastWithTheme = ({
	children,
	...props
}): React.ReactElement => {
	return (
		<DefaultToast
			components={{ Toast: CustomToastWithTheme }}
			{...props}
			// @ts-ignore: some minor type complain, it is fine here
			style={{
				color: '#293742',
				backgroundColor: LIGHT_UI_BACKGROUND,
			}}
		>
			<>{children}</>
		</DefaultToast>
	);
};

export default function HomePage(): React.ReactElement {
	console.log('window.api', window.api);
	const [activeStep, setActiveStep] = useState(0);
	const [isAllowDeviceAlertOpen, setIsAllowDeviceAlertOpen] = useState(false);
	const [isUserAllowedConnection, setIsUserAllowedConnection] = useState(false);
	const [pendingConnectionDevice, setPendingConnectionDevice] =
		useState<Device | null>(null);

	const hasScreenPermission = useScreenRecordingPermission();

	const handleResetWithSharingSessionRestart =
		useCallback(async (): Promise<void> => {
			setActiveStep(0);
			setPendingConnectionDevice(null);
			setIsUserAllowedConnection(false);
			setIsAllowDeviceAlertOpen(false);

			await window.electron.ipcRenderer.invoke(
				IpcEvents.ResetWaitingForConnectionSharingSession,
			);
			await window.electron.ipcRenderer.invoke(
				IpcEvents.CreateWaitingForConnectionSharingSession,
			);
		}, []);

	return (
		<ToastProvider
			placement="top-center"
			autoDismissTimeout={5000}
			components={{ Toast: CustomToastWithTheme }}
		>
			<div
				className={Classes.TREE}
				style={{
					minHeight: '100vh',
					overflowY: 'auto',
					paddingBottom: '28px',
					boxSizing: 'border-box',
					background:
						'radial-gradient(circle at top left, rgba(19, 185, 138, 0.12), transparent 36%), radial-gradient(circle at top right, rgba(13, 139, 217, 0.15), transparent 34%), #f5f8fa',
				}}
			>
				<TopPanel handleReset={handleResetWithSharingSessionRestart} />
				<main
					style={{
						width: 'calc(100% - 32px)',
						maxWidth: '1120px',
						margin: '0 auto',
						padding: '4px 18px 24px',
						boxSizing: 'border-box',
						background: 'rgba(255, 255, 255, 0.78)',
						border: '1px solid rgba(16, 107, 163, 0.1)',
						borderRadius: '22px',
						boxShadow: '0 18px 48px rgba(41, 55, 66, 0.08)',
					}}
				>
					<DeskreenStepper
						activeStep={activeStep}
						setActiveStep={setActiveStep}
						isAllowDeviceAlertOpen={isAllowDeviceAlertOpen}
						setIsAllowDeviceAlertOpen={setIsAllowDeviceAlertOpen}
						isUserAllowedConnection={isUserAllowedConnection}
						setIsUserAllowedConnection={setIsUserAllowedConnection}
						pendingConnectionDevice={pendingConnectionDevice}
						setPendingConnectionDevice={setPendingConnectionDevice}
						handleReset={handleResetWithSharingSessionRestart}
					/>
				</main>
				<ScreenRecordingPermissionModal isOpen={!hasScreenPermission} />
			</div>
		</ToastProvider>
	);
}
