import {
	useCallback,
	useEffect,
	useRef,
	type KeyboardEvent,
	type PointerEvent,
	type WheelEvent,
} from 'react';
import type { RemoteControlInput } from '../../../../common/RemoteControl';

interface RemoteControlSurfaceProps {
	sendInput: (input: RemoteControlInput) => void;
}

type NormalizedPoint = { x: number; y: number };

function getNormalizedVideoPoint(
	element: HTMLDivElement,
	clientX: number,
	clientY: number,
): NormalizedPoint | null {
	const bounds = element.getBoundingClientRect();
	const video = element.parentElement?.querySelector('video');
	const videoWidth = video?.videoWidth || bounds.width;
	const videoHeight = video?.videoHeight || bounds.height;
	if (
		bounds.width <= 0 ||
		bounds.height <= 0 ||
		videoWidth <= 0 ||
		videoHeight <= 0
	) {
		return null;
	}

	const videoAspectRatio = videoWidth / videoHeight;
	const containerAspectRatio = bounds.width / bounds.height;
	const contentWidth =
		containerAspectRatio > videoAspectRatio
			? bounds.height * videoAspectRatio
			: bounds.width;
	const contentHeight =
		containerAspectRatio > videoAspectRatio
			? bounds.height
			: bounds.width / videoAspectRatio;
	const contentLeft = bounds.left + (bounds.width - contentWidth) / 2;
	const contentTop = bounds.top + (bounds.height - contentHeight) / 2;

	if (
		clientX < contentLeft ||
		clientX > contentLeft + contentWidth ||
		clientY < contentTop ||
		clientY > contentTop + contentHeight
	) {
		return null;
	}

	return {
		x: Math.max(0, Math.min(1, (clientX - contentLeft) / contentWidth)),
		y: Math.max(0, Math.min(1, (clientY - contentTop) / contentHeight)),
	};
}

function toMouseButton(button: number): 'left' | 'middle' | 'right' | null {
	if (button === 0) return 'left';
	if (button === 1) return 'middle';
	if (button === 2) return 'right';
	return null;
}

export default function RemoteControlSurface({
	sendInput,
}: RemoteControlSurfaceProps) {
	const surfaceRef = useRef<HTMLDivElement>(null);
	const pendingMoveRef = useRef<NormalizedPoint | null>(null);
	const animationFrameRef = useRef<number | null>(null);

	const releaseAll = useCallback(() => {
		sendInput({ type: 'release_all' });
	}, [sendInput]);

	const flushPointerMove = useCallback(() => {
		animationFrameRef.current = null;
		if (!pendingMoveRef.current) return;
		sendInput({ type: 'pointer_move', ...pendingMoveRef.current });
		pendingMoveRef.current = null;
	}, [sendInput]);

	const handlePointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			const point = getNormalizedVideoPoint(
				event.currentTarget,
				event.clientX,
				event.clientY,
			);
			if (!point) return;
			pendingMoveRef.current = point;
			if (animationFrameRef.current === null) {
				animationFrameRef.current = requestAnimationFrame(flushPointerMove);
			}
			event.preventDefault();
		},
		[flushPointerMove],
	);

	const handlePointerButton = useCallback(
		(event: PointerEvent<HTMLDivElement>, action: 'down' | 'up') => {
			const button = toMouseButton(event.button);
			const point = getNormalizedVideoPoint(
				event.currentTarget,
				event.clientX,
				event.clientY,
			);
			if (!button) return;
			if (!point) {
				if (action === 'up') {
					releaseAll();
					if (event.currentTarget.hasPointerCapture(event.pointerId)) {
						event.currentTarget.releasePointerCapture(event.pointerId);
					}
				}
				return;
			}

			if (action === 'down') {
				event.currentTarget.focus({ preventScroll: true });
				event.currentTarget.setPointerCapture(event.pointerId);
			} else if (event.currentTarget.hasPointerCapture(event.pointerId)) {
				event.currentTarget.releasePointerCapture(event.pointerId);
			}

			sendInput({ type: 'mouse_button', button, action, ...point });
			event.preventDefault();
		},
		[releaseAll, sendInput],
	);

	const handleKey = useCallback(
		(event: KeyboardEvent<HTMLDivElement>, action: 'down' | 'up') => {
			if (action === 'down' && event.repeat) {
				event.preventDefault();
				return;
			}
			sendInput({ type: 'key', code: event.code, action });
			event.preventDefault();
			event.stopPropagation();
		},
		[sendInput],
	);

	const handleWheel = useCallback(
		(event: WheelEvent<HTMLDivElement>) => {
			sendInput({
				type: 'wheel',
				deltaX: event.deltaX,
				deltaY: event.deltaY,
			});
			event.preventDefault();
		},
		[sendInput],
	);

	useEffect(() => {
		const surface = surfaceRef.current;
		surface?.focus({ preventScroll: true });
		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			releaseAll();
		};
	}, [releaseAll]);

	return (
		<div
			ref={surfaceRef}
			role="application"
			aria-label="Remote desktop control surface"
			tabIndex={0}
			onPointerMove={handlePointerMove}
			onPointerDown={(event) => handlePointerButton(event, 'down')}
			onPointerUp={(event) => handlePointerButton(event, 'up')}
			onPointerCancel={releaseAll}
			onKeyDown={(event) => handleKey(event, 'down')}
			onKeyUp={(event) => handleKey(event, 'up')}
			onWheel={handleWheel}
			onBlur={releaseAll}
			onContextMenu={(event) => event.preventDefault()}
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 2,
				cursor: 'crosshair',
				outline: 'none',
				touchAction: 'none',
			}}
		/>
	);
}
