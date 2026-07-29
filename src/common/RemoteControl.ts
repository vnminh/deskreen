export type RemoteControlMouseButton = 'left' | 'middle' | 'right';
export type RemoteControlButtonAction = 'down' | 'up';

export type RemoteControlInput =
	| {
			type: 'pointer_move';
			x: number;
			y: number;
	  }
	| {
			type: 'mouse_button';
			button: RemoteControlMouseButton;
			action: RemoteControlButtonAction;
			x: number;
			y: number;
	  }
	| {
			type: 'wheel';
			deltaX: number;
			deltaY: number;
	  }
	| {
			type: 'key';
			code: string;
			action: RemoteControlButtonAction;
	  }
	| {
			type: 'release_all';
	  };

export interface RemoteControlStatus {
	enabled: boolean;
	supported: boolean;
	reason?: string;
}
