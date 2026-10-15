// Calibration windows tell each other what they show, so the primary can hold
// back its QR code until every screen shows its markers. Same-origin windows
// only (BroadcastChannel); nothing leaves the computer.
//
// Messages: { type: 'hello' | 'state', s: screen list, n, state }
// state: 'pattern' | 'waiting' | 'wrong-screen' | 'closed'

const CHANNEL = 'seamscape-calibration';

// Join as monitor n of the calibration for screensText. onChange runs when
// another window's state changes. Returns { states, set(state), leave() }.
export function joinCalibration(screensText, n, onChange) {
  const states = new Map(); // other monitor number -> state
  let mine = null;
  let channel = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    // No BroadcastChannel: every window counts as unknown and the QR code
    // shows anyway (see renderCalibration).
    return { states, set() {}, leave() {}, available: false };
  }
  const post = (state) => channel.postMessage({ type: 'state', s: screensText, n, state });
  channel.onmessage = ({ data: msg }) => {
    if (!msg || msg.s !== screensText || msg.n === n) return;
    if (msg.type === 'hello') {
      if (mine) post(mine);
      return;
    }
    if (msg.type !== 'state') return;
    if (msg.state === 'closed') states.delete(msg.n);
    else states.set(msg.n, msg.state);
    onChange();
  };
  channel.postMessage({ type: 'hello', s: screensText, n });
  const leave = () => {
    if (!channel) return;
    post('closed');
    channel.close();
    channel = null;
  };
  window.addEventListener('pagehide', leave);
  return {
    states,
    available: true,
    set(state) {
      if (state === mine || !channel) return;
      mine = state;
      post(state);
    },
    leave() {
      window.removeEventListener('pagehide', leave);
      leave();
    },
  };
}
