type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function BirthDateField({value, onChange}: Props) {
  const today = new Date();
  const maximum = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        margin: '8px 0',
      }}>
      Fecha de nacimiento

      <input
        type="date"
        value={value}
        min="1900-01-01"
        max={maximum}
        required
        onChange={event => onChange(event.currentTarget.value)}
        style={{
          padding: 14,
          border: '1px solid #888',
          borderRadius: 8,
          fontSize: 16,
          fontFamily: 'inherit',
          backgroundColor: '#fff',
          color: '#222',
          boxSizing: 'border-box',
          width: '100%',
        }}
      />
    </label>
  );
}
