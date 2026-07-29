import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent,
	type Touch,
	type TouchEvent,
	type TouchList,
	type WheelEvent,
} from 'react';
import type { RemoteControlInput } from '../../../../common/RemoteControl';

interface RemoteControlSurfaceProps {
	sendInput: (input: RemoteControlInput) => void;
}

type NormalizedPoint = { x: number; y: number };
type ClientPoint = { x: number; y: number };

interface SingleTouchState {
	start: ClientPoint;
	last: ClientPoint;
	moved: boolean;
	dragActive: boolean;
}

interface MultiTouchState {
	startedAt: number;
	startCentroid: ClientPoint;
	lastCentroid: ClientPoint;
	startDistance: number;
	lastDistance: number;
	maxMovement: number;
	mode: 'pending' | 'scroll' | 'zoom';
	scrollX: number;
	scrollY: number;
	zoomDelta: number;
}

const TAP_MOVE_THRESHOLD = 8;
const GESTURE_THRESHOLD = 10;
const LONG_PRESS_DELAY_MS = 450;
const TWO_FINGER_TAP_MAX_MS = 400;

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

function distanceBetween(first: ClientPoint, second: ClientPoint): number {
	return Math.hypot(second.x - first.x, second.y - first.y);
}

function getTouchPoint(touch: Touch): ClientPoint {
	return { x: touch.clientX, y: touch.clientY };
}

function getTwoTouchGeometry(touches: TouchList): {
	centroid: ClientPoint;
	distance: number;
} {
	const first = getTouchPoint(touches[0]);
	const second = getTouchPoint(touches[1]);
	return {
		centroid: {
			x: (first.x + second.x) / 2,
			y: (first.y + second.y) / 2,
		},
		distance: distanceBetween(first, second),
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
	const singleTouchRef = useRef<SingleTouchState | null>(null);
	const multiTouchRef = useRef<MultiTouchState | null>(null);
	const longPressTimerRef = useRef<number | null>(null);
	const suppressSingleTouchRef = useRef(false);
	const [showGestureHint, setShowGestureHint] = useState(
		() => navigator.maxTouchPoints > 0,
	);

	const releaseAll = useCallback(() => {
		sendInput({ type: 'release_all' });
	}, [sendInput]);

	const flushPointerMove = useCallback(() => {
		animationFrameRef.current = null;
		if (!pendingMoveRef.current) return;
		sendInput({ type: 'pointer_move', ...pendingMoveRef.current });
		pendingMoveRef.current = null;
	}, [sendInput]);

	const clearLongPressTimer = useCallback(() => {
		if (longPressTimerRef.current === null) return;
		window.clearTimeout(longPressTimerRef.current);
		longPressTimerRef.current = null;
	}, []);

	const queuePointerMove = useCallback(
		(element: HTMLDivElement, clientX: number, clientY: number) => {
			const point = getNormalizedVideoPoint(element, clientX, clientY);
			if (!point) return;
			pendingMoveRef.current = point;
			if (animationFrameRef.current === null) {
				animationFrameRef.current = requestAnimationFrame(flushPointerMove);
			}
		},
		[flushPointerMove],
	);

	const sendMouseClick = useCallback(
		(element: HTMLDivElement, button: 'left' | 'right', point: ClientPoint) => {
			const normalized = getNormalizedVideoPoint(element, point.x, point.y);
			if (!normalized) return;
			sendInput({
				type: 'mouse_button',
				button,
				action: 'down',
				...normalized,
			});
			sendInput({
				type: 'mouse_button',
				button,
				action: 'up',
				...normalized,
			});
		},
		[sendInput],
	);

	const beginMultiTouch = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			clearLongPressTimer();
			if (singleTouchRef.current?.dragActive) releaseAll();
			singleTouchRef.current = null;
			const { centroid, distance } = getTwoTouchGeometry(event.touches);
			multiTouchRef.current = {
				startedAt: performance.now(),
				startCentroid: centroid,
				lastCentroid: centroid,
				startDistance: distance,
				lastDistance: distance,
				maxMovement: 0,
				mode: 'pending',
				scrollX: 0,
				scrollY: 0,
				zoomDelta: 0,
			};
		},
		[clearLongPressTimer, releaseAll],
	);

	const handleTouchStart = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			setShowGestureHint(false);
			event.currentTarget.focus({ preventScroll: true });
			if (event.touches.length >= 2) {
				beginMultiTouch(event);
				event.preventDefault();
				return;
			}
			if (suppressSingleTouchRef.current || event.touches.length !== 1) {
				event.preventDefault();
				return;
			}

			const element = event.currentTarget;
			const point = getTouchPoint(event.touches[0]);
			singleTouchRef.current = {
				start: point,
				last: point,
				moved: false,
				dragActive: false,
			};
			clearLongPressTimer();
			longPressTimerRef.current = window.setTimeout(() => {
				longPressTimerRef.current = null;
				const touch = singleTouchRef.current;
				if (!touch || touch.moved || multiTouchRef.current) return;
				const normalized = getNormalizedVideoPoint(
					element,
					touch.last.x,
					touch.last.y,
				);
				if (!normalized) return;
				sendInput({ type: 'pointer_move', ...normalized });
				sendInput({
					type: 'mouse_button',
					button: 'left',
					action: 'down',
					...normalized,
				});
				touch.dragActive = true;
			}, LONG_PRESS_DELAY_MS);
			event.preventDefault();
		},
		[beginMultiTouch, clearLongPressTimer, sendInput],
	);

	const handleTouchMove = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			if (event.touches.length >= 2) {
				if (!multiTouchRef.current) beginMultiTouch(event);
				const gesture = multiTouchRef.current;
				if (!gesture) return;
				const { centroid, distance } = getTwoTouchGeometry(event.touches);
				const centroidMovement = distanceBetween(
					gesture.startCentroid,
					centroid,
				);
				const distanceMovement = Math.abs(distance - gesture.startDistance);
				gesture.maxMovement = Math.max(
					gesture.maxMovement,
					centroidMovement,
					distanceMovement,
				);

				if (gesture.mode === 'pending') {
					if (
						distanceMovement >= GESTURE_THRESHOLD &&
						distanceMovement >= centroidMovement * 0.75
					) {
						gesture.mode = 'zoom';
					} else if (centroidMovement >= GESTURE_THRESHOLD) {
						gesture.mode = 'scroll';
					}
				}

				if (gesture.mode === 'zoom') {
					gesture.zoomDelta += distance - gesture.lastDistance;
					if (Math.abs(gesture.zoomDelta) >= GESTURE_THRESHOLD) {
						sendInput({ type: 'zoom', delta: gesture.zoomDelta });
						gesture.zoomDelta = 0;
					}
				} else if (gesture.mode === 'scroll') {
					gesture.scrollX += gesture.lastCentroid.x - centroid.x;
					gesture.scrollY += gesture.lastCentroid.y - centroid.y;
					if (
						Math.abs(gesture.scrollX) >= TAP_MOVE_THRESHOLD ||
						Math.abs(gesture.scrollY) >= TAP_MOVE_THRESHOLD
					) {
						sendInput({
							type: 'wheel',
							deltaX: gesture.scrollX * 12,
							deltaY: gesture.scrollY * 12,
						});
						gesture.scrollX = 0;
						gesture.scrollY = 0;
					}
				}

				gesture.lastCentroid = centroid;
				gesture.lastDistance = distance;
				event.preventDefault();
				return;
			}

			const touch = singleTouchRef.current;
			if (
				!touch ||
				suppressSingleTouchRef.current ||
				event.touches.length !== 1
			) {
				return;
			}
			const point = getTouchPoint(event.touches[0]);
			touch.last = point;
			if (distanceBetween(touch.start, point) >= TAP_MOVE_THRESHOLD) {
				touch.moved = true;
				if (!touch.dragActive) clearLongPressTimer();
			}
			queuePointerMove(event.currentTarget, point.x, point.y);
			event.preventDefault();
		},
		[beginMultiTouch, clearLongPressTimer, queuePointerMove, sendInput],
	);

	const handleTouchEnd = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			clearLongPressTimer();
			const gesture = multiTouchRef.current;
			if (gesture && event.touches.length < 2) {
				const isTwoFingerTap =
					gesture.mode === 'pending' &&
					gesture.maxMovement < GESTURE_THRESHOLD &&
					performance.now() - gesture.startedAt <= TWO_FINGER_TAP_MAX_MS;
				if (isTwoFingerTap) {
					sendMouseClick(event.currentTarget, 'right', gesture.lastCentroid);
				}
				multiTouchRef.current = null;
				singleTouchRef.current = null;
				suppressSingleTouchRef.current = event.touches.length > 0;
				if (event.touches.length === 0) {
					suppressSingleTouchRef.current = false;
				}
				event.preventDefault();
				return;
			}

			if (event.touches.length === 0) {
				const touch = singleTouchRef.current;
				if (touch) {
					const normalized = getNormalizedVideoPoint(
						event.currentTarget,
						touch.last.x,
						touch.last.y,
					);
					if (touch.dragActive) {
						if (normalized) {
							sendInput({
								type: 'mouse_button',
								button: 'left',
								action: 'up',
								...normalized,
							});
						} else {
							releaseAll();
						}
					} else if (!touch.moved) {
						sendMouseClick(event.currentTarget, 'left', touch.last);
					}
				}
				singleTouchRef.current = null;
				suppressSingleTouchRef.current = false;
			}
			event.preventDefault();
		},
		[clearLongPressTimer, releaseAll, sendInput, sendMouseClick],
	);

	const handleTouchCancel = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			clearLongPressTimer();
			singleTouchRef.current = null;
			multiTouchRef.current = null;
			suppressSingleTouchRef.current = false;
			releaseAll();
			event.preventDefault();
		},
		[clearLongPressTimer, releaseAll],
	);

	const handlePointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (event.pointerType === 'touch') return;
			queuePointerMove(event.currentTarget, event.clientX, event.clientY);
			event.preventDefault();
		},
		[queuePointerMove],
	);

	const handlePointerButton = useCallback(
		(event: PointerEvent<HTMLDivElement>, action: 'down' | 'up') => {
			if (event.pointerType === 'touch') return;
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
		const hintTimer = window.setTimeout(() => setShowGestureHint(false), 6500);
		return () => {
			window.clearTimeout(hintTimer);
			clearLongPressTimer();
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			releaseAll();
		};
	}, [clearLongPressTimer, releaseAll]);

	return (
		<div
			ref={surfaceRef}
			role="application"
			aria-label="Remote desktop control surface"
			tabIndex={0}
			onPointerMove={handlePointerMove}
			onPointerDown={(event) => handlePointerButton(event, 'down')}
			onPointerUp={(event) => handlePointerButton(event, 'up')}
			onPointerCancel={(event) => {
				if (event.pointerType !== 'touch') releaseAll();
			}}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={handleTouchEnd}
			onTouchCancel={handleTouchCancel}
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
		>
			{showGestureHint && (
				<div
					style={{
						position: 'absolute',
						left: '50%',
						bottom: '18px',
						transform: 'translateX(-50%)',
						maxWidth: 'calc(100% - 24px)',
						padding: '8px 12px',
						color: '#ffffff',
						background: 'rgba(17, 27, 45, 0.86)',
						border: '1px solid rgba(255, 255, 255, 0.18)',
						borderRadius: '999px',
						boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
						fontSize: '12px',
						lineHeight: 1.35,
						textAlign: 'center',
						width: 'max-content',
						pointerEvents: 'none',
					}}
				>
					1 finger: move/tap · Hold: drag · 2 fingers: scroll/tap right-click ·
					Pinch: zoom
				</div>
			)}
		</div>
	);
}
