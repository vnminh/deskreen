import * as robot from '@jitsi/robotjs';
import type { Display } from 'electron';
import type {
	RemoteControlInput,
	RemoteControlMouseButton,
} from '../../common/RemoteControl';

const MAX_WHEEL_STEP = 10;

const SPECIAL_KEYS: Readonly<Record<string, string>> = {
	AltLeft: 'alt',
	AltRight: 'right_alt',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
	ArrowUp: 'up',
	Backspace: 'backspace',
	CapsLock: 'capslock',
	ContextMenu: 'menu',
	ControlLeft: 'left_control',
	ControlRight: 'right_control',
	Delete: 'delete',
	End: 'end',
	Enter: 'enter',
	Escape: 'escape',
	Home: 'home',
	Insert: 'insert',
	MetaLeft: 'command',
	MetaRight: 'command',
	NumLock: 'numpad_lock',
	NumpadAdd: 'numpad_+',
	NumpadDecimal: 'numpad_.',
	NumpadDivide: 'numpad_/',
	NumpadMultiply: 'numpad_*',
	NumpadSubtract: 'numpad_-',
	PageDown: 'pagedown',
	PageUp: 'pageup',
	PrintScreen: 'printscreen',
	ShiftLeft: 'shift',
	ShiftRight: 'right_shift',
	Space: 'space',
	Tab: 'tab',
};

const PUNCTUATION_KEYS: Readonly<Record<string, string>> = {
	Backquote: '`',
	Backslash: '\\',
	BracketLeft: '[',
	BracketRight: ']',
	Comma: ',',
	Equal: '=',
	Minus: '-',
	Period: '.',
	Quote: "'",
	Semicolon: ';',
	Slash: '/',
};

function browserCodeToRobotKey(code: string): string | undefined {
	if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
	if (/^Digit[0-9]$/.test(code)) return code.slice(5);
	if (/^Numpad[0-9]$/.test(code)) return `numpad_${code.slice(6)}`;
	if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) {
		return code.toLowerCase();
	}
	return SPECIAL_KEYS[code] ?? PUNCTUATION_KEYS[code];
}

function isNormalizedCoordinate(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= 1
	);
}

function isRemoteControlInput(value: unknown): value is RemoteControlInput {
	if (!value || typeof value !== 'object') return false;
	const input = value as Partial<RemoteControlInput>;

	switch (input.type) {
		case 'pointer_move':
			return isNormalizedCoordinate(input.x) && isNormalizedCoordinate(input.y);
		case 'mouse_button':
			return (
				(input.button === 'left' ||
					input.button === 'middle' ||
					input.button === 'right') &&
				(input.action === 'down' || input.action === 'up') &&
				isNormalizedCoordinate(input.x) &&
				isNormalizedCoordinate(input.y)
			);
		case 'wheel':
			return (
				typeof input.deltaX === 'number' &&
				Number.isFinite(input.deltaX) &&
				typeof input.deltaY === 'number' &&
				Number.isFinite(input.deltaY)
			);
		case 'zoom':
			return typeof input.delta === 'number' && Number.isFinite(input.delta);
		case 'key':
			return (
				typeof input.code === 'string' &&
				input.code.length <= 32 &&
				(input.action === 'down' || input.action === 'up')
			);
		case 'release_all':
			return true;
		default:
			return false;
	}
}

export default class RemoteControlService {
	private readonly pressedKeys = new Map<number, Set<string>>();
	private readonly pressedButtons = new Map<
		number,
		Set<RemoteControlMouseButton>
	>();

	constructor() {
		robot.setMouseDelay(0);
		robot.setKeyboardDelay(0);
	}

	handleInput(
		sessionWebContentsId: number,
		display: Display,
		untrustedInput: unknown,
	): void {
		if (!isRemoteControlInput(untrustedInput)) return;

		try {
			switch (untrustedInput.type) {
				case 'pointer_move':
					this.movePointer(display, untrustedInput.x, untrustedInput.y);
					break;
				case 'mouse_button':
					this.movePointer(display, untrustedInput.x, untrustedInput.y);
					this.toggleMouse(
						sessionWebContentsId,
						untrustedInput.button,
						untrustedInput.action,
					);
					break;
				case 'wheel':
					robot.scrollMouse(
						this.toWheelStep(-untrustedInput.deltaX),
						this.toWheelStep(-untrustedInput.deltaY),
					);
					break;
				case 'zoom':
					this.zoom(untrustedInput.delta);
					break;
				case 'key':
					this.toggleKey(
						sessionWebContentsId,
						untrustedInput.code,
						untrustedInput.action,
					);
					break;
				case 'release_all':
					this.releaseSession(sessionWebContentsId);
					break;
			}
		} catch (error) {
			console.error('Failed to apply remote control input', error);
			this.releaseSession(sessionWebContentsId);
		}
	}

	releaseSession(sessionWebContentsId: number): void {
		const keys = this.pressedKeys.get(sessionWebContentsId);
		keys?.forEach((key) => {
			try {
				robot.keyToggle(key, 'up');
			} catch (error) {
				console.error(`Failed to release remote key "${key}"`, error);
			}
		});
		this.pressedKeys.delete(sessionWebContentsId);

		const buttons = this.pressedButtons.get(sessionWebContentsId);
		buttons?.forEach((button) => {
			try {
				robot.mouseToggle('up', button);
			} catch (error) {
				console.error(
					`Failed to release remote mouse button "${button}"`,
					error,
				);
			}
		});
		this.pressedButtons.delete(sessionWebContentsId);
	}

	private movePointer(
		display: Display,
		normalizedX: number,
		normalizedY: number,
	): void {
		const x = Math.round(
			display.bounds.x + normalizedX * Math.max(display.bounds.width - 1, 0),
		);
		const y = Math.round(
			display.bounds.y + normalizedY * Math.max(display.bounds.height - 1, 0),
		);
		robot.moveMouse(x, y);
	}

	private toggleMouse(
		sessionWebContentsId: number,
		button: RemoteControlMouseButton,
		action: 'down' | 'up',
	): void {
		const pressed =
			this.pressedButtons.get(sessionWebContentsId) ??
			new Set<RemoteControlMouseButton>();
		if (action === 'down') {
			if (pressed.has(button)) return;
			pressed.add(button);
			this.pressedButtons.set(sessionWebContentsId, pressed);
		} else {
			if (!pressed.has(button)) return;
			pressed.delete(button);
		}
		robot.mouseToggle(action, button);
	}

	private toggleKey(
		sessionWebContentsId: number,
		code: string,
		action: 'down' | 'up',
	): void {
		const key = browserCodeToRobotKey(code);
		if (!key) return;

		const pressed =
			this.pressedKeys.get(sessionWebContentsId) ?? new Set<string>();
		if (action === 'down') {
			if (pressed.has(key)) return;
			pressed.add(key);
			this.pressedKeys.set(sessionWebContentsId, pressed);
		} else {
			if (!pressed.has(key)) return;
			pressed.delete(key);
		}
		robot.keyToggle(key, action);
	}

	private zoom(delta: number): void {
		if (delta === 0) return;
		const modifier = process.platform === 'darwin' ? 'command' : 'control';
		const key = delta > 0 ? '=' : '-';
		const repeatCount = Math.min(
			3,
			Math.max(1, Math.round(Math.abs(delta) / 12)),
		);
		for (let index = 0; index < repeatCount; index += 1) {
			robot.keyTap(key, modifier);
		}
	}

	private toWheelStep(delta: number): number {
		if (delta === 0) return 0;
		const step = Math.round(delta / 100);
		return Math.max(
			-MAX_WHEEL_STEP,
			Math.min(MAX_WHEEL_STEP, step || Math.sign(delta)),
		);
	}
}
