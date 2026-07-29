import DesktopCapturerSourceType from '../../../../common/DesktopCapturerSourceType';
import getDesktopSourceStreamBySourceID from './getDesktopSourceStreamBySourceID';
import prepareDataMessageToSendScreenSourceType from './prepareDataMessageToSendScreenSourceType';
import NullSimplePeer from './NullSimplePeer';
import { IpcEvents } from '../../../../common/IpcEvents.enum';

export default async function handlePeerOnData(
	peerConnection: PeerConnection,
	data: string,
): Promise<void> {
	let dataJSON: { type?: string; payload?: Record<string, unknown> };
	try {
		dataJSON = JSON.parse(data.toString());
	} catch (error) {
		console.error('Ignored malformed peer data', error);
		return;
	}

	if (dataJSON.type === 'remote_control_input') {
		if (!peerConnection.remoteControlEnabled) return;
		window.electron.ipcRenderer.send(
			IpcEvents.RemoteControlInput,
			dataJSON.payload,
		);
		return;
	}

	if (dataJSON.type === 'set_video_quality') {
		const maxVideoQualityMultiplier = dataJSON.payload?.value as number;
		const minVideoQualityMultiplier =
			maxVideoQualityMultiplier === 1 ? 0.5 : maxVideoQualityMultiplier;

		if (
			!peerConnection.desktopCapturerSourceID.includes(
				DesktopCapturerSourceType.SCREEN,
			)
		)
			return;

		const newStream = await getDesktopSourceStreamBySourceID(
			peerConnection.desktopCapturerSourceID,
			peerConnection.sourceDisplaySize?.width,
			peerConnection.sourceDisplaySize?.height,
			minVideoQualityMultiplier,
			maxVideoQualityMultiplier,
			60,
			60,
		);
		const newVideoTrack = newStream.getVideoTracks()[0];
		const oldStream = peerConnection.localStream;
		const oldTrack = oldStream?.getVideoTracks()[0];

		if (oldTrack && oldStream && peerConnection.peer !== NullSimplePeer) {
			await peerConnection.peer.replaceTrack(
				oldTrack,
				newVideoTrack,
				oldStream,
			);
			// stop only the old track (it's already removed from the stream by replaceTrack)
			oldTrack.stop();
			// stop any remaining tracks in the old stream, but don't stop the new track
			oldStream.getTracks().forEach((track) => {
				if (track.id !== newVideoTrack.id) {
					track.stop();
				}
			});
		}

		// update local stream reference to new stream
		peerConnection.localStream = newStream;
		if (peerConnection.remoteControlEnabled) {
			await peerConnection.updateVideoLatencyPreference();
		}
	}

	if (dataJSON.type === 'get_sharing_source_type') {
		const sourceType = peerConnection.desktopCapturerSourceID.includes(
			DesktopCapturerSourceType.SCREEN,
		)
			? DesktopCapturerSourceType.SCREEN
			: DesktopCapturerSourceType.WINDOW;

		peerConnection.peer.send(
			prepareDataMessageToSendScreenSourceType(sourceType),
		);
	}
}
