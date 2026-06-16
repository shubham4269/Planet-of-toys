// packages/shared-web/src/catalog/AttributeFilterView.jsx
/**
 * AttributeFilterView — renders ONE attribute as its storefront filter control,
 * chosen by `attribute.displayType`. Controlled when `onToggle` is supplied
 * (selection is an array of value slugs); otherwise renders uncontrolled (used by
 * the admin attribute preview). Pure & presentational; consumer supplies CSS.
 *
 * @param {object} props
 * @param {{id,name,displayType,values:Array<{slug?,id?,name,swatchHex}>}|null} props.attribute
 * @param {string[]} [props.selected]  selected value keys (slug ?? id)
 * @param {(valueKey:string)=>void} [props.onToggle]
 */
export default function AttributeFilterView({ attribute, selected = [], onToggle }) {
  if (!attribute) return null;
  const { name, displayType, values = [] } = attribute;
  const groupName = `attr-${attribute.id ?? attribute.attributeSlug ?? name}`;
  const keyOf = (v) => v.slug ?? v.id;
  const isOn = (v) => selected.includes(keyOf(v));
  const controlled = typeof onToggle === "function";

  return (
    <fieldset className="pot-filter">
      <legend className="pot-filter__title">{name}</legend>
      <div className={`pot-filter__body pot-filter__body--${displayType}`}>
        {renderControl({ displayType, values, groupName, keyOf, isOn, controlled, onToggle })}
      </div>
    </fieldset>
  );
}

function renderControl({ displayType, values, groupName, keyOf, isOn, controlled, onToggle }) {
  const box = (type, v) => {
    const key = keyOf(v);
    const props = { type, name: groupName, value: key };
    if (controlled) { props.checked = isOn(v); props.onChange = () => onToggle(key); }
    return (
      <label key={key} className="pot-filter__opt">
        <input {...props} /> <span>{v.name}</span>
      </label>
    );
  };
  switch (displayType) {
    case "radio":
      return values.map((v) => box("radio", v));
    case "dropdown":
      return (
        <select className="pot-filter__select"
          {...(controlled
            ? { value: values.filter(isOn).map(keyOf)[0] ?? "", onChange: (e) => onToggle(e.target.value) }
            : { defaultValue: "" })}>
          <option value="" disabled>Select…</option>
          {values.map((v) => <option key={keyOf(v)} value={keyOf(v)}>{v.name}</option>)}
        </select>
      );
    case "color":
      return (
        <div className="pot-filter__swatches">
          {values.map((v) => (
            <button key={keyOf(v)} type="button"
              className={`pot-filter__swatch${controlled && isOn(v) ? " pot-filter__swatch--on" : ""}`}
              aria-label={v.name} aria-pressed={controlled ? isOn(v) : undefined} title={v.name}
              style={{ backgroundColor: v.swatchHex || "#ccc" }}
              onClick={controlled ? () => onToggle(keyOf(v)) : undefined} />
          ))}
        </div>
      );
    case "button":
      return values.map((v) => (
        <button key={keyOf(v)} type="button"
          className={`pot-filter__pill${controlled && isOn(v) ? " pot-filter__pill--on" : ""}`}
          aria-pressed={controlled ? isOn(v) : undefined}
          onClick={controlled ? () => onToggle(keyOf(v)) : undefined}>{v.name}</button>
      ));
    case "range":
      return <input type="range" className="pot-filter__range" min="0" max="100" defaultValue="50" aria-label="Range" />;
    case "checkbox":
    default:
      return values.map((v) => box("checkbox", v));
  }
}
