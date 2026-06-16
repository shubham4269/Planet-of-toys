// packages/shared-web/src/catalog/AttributeFilterView.jsx
/**
 * AttributeFilterView — renders ONE attribute as its storefront filter control,
 * chosen by `attribute.displayType`. Pure and presentational; this is the seed of
 * the full FilterView in Sub-project B. Controls are uncontrolled here (preview /
 * structural rendering); selection wiring arrives in B. Consumer supplies CSS.
 *
 * @param {object} props
 * @param {{id,name,displayType,values:Array<{id,name,swatchHex}>}|null} props.attribute
 */
export default function AttributeFilterView({ attribute }) {
  if (!attribute) return null;
  const { name, displayType, values = [] } = attribute;
  const groupName = `attr-${attribute.id}`;

  return (
    <fieldset className="pot-filter">
      <legend className="pot-filter__title">{name}</legend>
      <div className={`pot-filter__body pot-filter__body--${displayType}`}>
        {renderControl(displayType, values, groupName)}
      </div>
    </fieldset>
  );
}

function renderControl(displayType, values, groupName) {
  switch (displayType) {
    case "radio":
      return values.map((v) => (
        <label key={v.id} className="pot-filter__opt">
          <input type="radio" name={groupName} value={v.id} /> <span>{v.name}</span>
        </label>
      ));
    case "dropdown":
      return (
        <select className="pot-filter__select" defaultValue="">
          <option value="" disabled>Select…</option>
          {values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      );
    case "color":
      return (
        <div className="pot-filter__swatches">
          {values.map((v) => (
            <button key={v.id} type="button" className="pot-filter__swatch" aria-label={v.name}
              title={v.name} style={{ backgroundColor: v.swatchHex || "#ccc" }} />
          ))}
        </div>
      );
    case "button":
      return values.map((v) => (
        <button key={v.id} type="button" className="pot-filter__pill">{v.name}</button>
      ));
    case "range":
      return <input type="range" className="pot-filter__range" min="0" max="100" defaultValue="50" aria-label="Range" />;
    case "checkbox":
    default:
      return values.map((v) => (
        <label key={v.id} className="pot-filter__opt">
          <input type="checkbox" name={groupName} value={v.id} /> <span>{v.name}</span>
        </label>
      ));
  }
}
