import { today, shiftDay, dayLabel } from './api.js';

export default function DayPicker({ date, setDate }) {
  return (
    <div className="daypicker">
      <button onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">‹</button>
      <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      <button onClick={() => setDate(shiftDay(date, 1))} aria-label="Next day">›</button>
      {date !== today() && <button className="link" onClick={() => setDate(today())}>Today</button>}
      <span className="muted">{dayLabel(date)}</span>
    </div>
  );
}
