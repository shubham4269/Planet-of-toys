import "@planet-of-toys/shared-web/catalog/catalog-views.css";
import "./DevicePreview.css";

/**
 * DevicePreview — admin-only chrome showing the SAME shared View component in a
 * desktop frame and a width-constrained mobile frame, side by side. The View's
 * intrinsic responsive grid reflows to each frame's width, so the mobile frame
 * shows real mobile layout (no scaled screenshot). Pass the shared View as children.
 */
export default function DevicePreview({ children, mobileWidth = 390 }) {
  return (
    <div className="device-preview">
      <div className="device-preview__frame device-preview__frame--desktop">
        <span className="device-preview__label">Desktop</span>
        <div className="device-preview__viewport">{children}</div>
      </div>
      <div className="device-preview__frame device-preview__frame--mobile">
        <span className="device-preview__label">Mobile</span>
        <div className="device-preview__viewport" style={{ width: `${mobileWidth}px` }}>{children}</div>
      </div>
    </div>
  );
}
