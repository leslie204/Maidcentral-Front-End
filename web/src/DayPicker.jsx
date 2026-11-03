import { today, shiftDay, dayLabel } from './api.js';
import Icon from './Icon.jsx';

export default function DayPicker({ date, setDate }) {
  return (
    <div className="daypicker">
      <div className="segmented">
        <button onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day"><Icon name="chevronLeft" size={16} /></button>
        <button className={date === today() ? 'on' : ''} onClick={() => setDate(today())}>Today</button>
        <button onClick={() => setDate(shiftDay(date, 1))} aria-label="Next day"><Icon name="chevronRight" size={16} /></button>
      </div>
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={dayLabel(date)} />
    </div>
  );
}
