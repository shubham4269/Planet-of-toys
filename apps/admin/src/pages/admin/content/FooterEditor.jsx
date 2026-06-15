// apps/admin/src/pages/admin/content/FooterEditor.jsx
import { useCallback, useEffect, useState } from "react";
import apiClient, { ApiError } from "@planet-of-toys/shared-web/apiClient";
import { FooterView } from "@planet-of-toys/shared-web";
import { getToken, notifyUnauthorized } from "../../../lib/adminAuth.js";
import "./FooterEditor.css";

const API_PATH = "/api/admin/content/footer";
const PLATFORMS = ["facebook", "instagram", "youtube", "whatsapp", "twitter"];
const rid = () => `n-${Math.random().toString(36).slice(2)}`;

function toForm(f) {
  return {
    enabled: f?.enabled !== false,
    columns: (f?.columns ?? []).map((c) => ({ id: c.id || rid(), title: c.title || "", enabled: c.enabled !== false,
      links: (c.links ?? []).map((l) => ({ id: l.id || rid(), label: l.label || "", url: l.url || "", enabled: l.enabled !== false })) })),
    newsletter: { enabled: f?.newsletter?.enabled !== false, title: f?.newsletter?.title || "", subtitle: f?.newsletter?.subtitle || "", placeholder: f?.newsletter?.placeholder || "", buttonLabel: f?.newsletter?.buttonLabel || "" },
    membershipPromo: { enabled: f?.membershipPromo?.enabled !== false, title: f?.membershipPromo?.title || "", description: f?.membershipPromo?.description || "", buttonLabel: f?.membershipPromo?.buttonLabel || "", buttonUrl: f?.membershipPromo?.buttonUrl || "" },
    social: PLATFORMS.map((p) => ({ platform: p, url: (f?.social ?? []).find((s) => s.platform === p)?.url || "" })),
    contact: { companyName: f?.contact?.companyName || "", address: f?.contact?.address || "", phone: f?.contact?.phone || "", email: f?.contact?.email || "", whatsapp: f?.contact?.whatsapp || "", supportHours: f?.contact?.supportHours || "" },
    trustHighlights: (f?.trustHighlights ?? []).map((t) => ({ id: t.id || rid(), iconKey: t.iconKey || "shield", title: t.title || "", subtitle: t.subtitle || "" })),
    bottomLinks: (f?.bottomLinks ?? []).map((l) => ({ id: l.id || rid(), label: l.label || "", url: l.url || "", enabled: l.enabled !== false })),
    copyrightText: f?.copyrightText || "",
  };
}
function toPayload(form) {
  return {
    enabled: form.enabled,
    columns: form.columns.map((c) => ({ title: c.title, enabled: c.enabled, links: c.links.map((l) => ({ label: l.label, url: l.url, enabled: l.enabled })) })),
    newsletter: form.newsletter,
    membershipPromo: form.membershipPromo,
    social: form.social.filter((s) => s.url.trim()).map((s) => ({ platform: s.platform, url: s.url })),
    contact: form.contact,
    trustHighlights: form.trustHighlights.map((t) => ({ iconKey: t.iconKey, title: t.title, subtitle: t.subtitle })),
    bottomLinks: form.bottomLinks.map((l) => ({ label: l.label, url: l.url, enabled: l.enabled })),
    copyrightText: form.copyrightText,
  };
}

export default function FooterEditor() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const res = await apiClient.get(API_PATH, { token: getToken() }); setForm(toForm(res?.footer)); }
    catch (e) { if (e instanceof ApiError && e.status === 401) { notifyUnauthorized(); return; } setErr("Could not load the footer."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setColumns = (columns) => setForm((f) => ({ ...f, columns }));
  function addColumn() { setColumns([...form.columns, { id: rid(), title: "", enabled: true, links: [] }]); }
  function removeColumn(i) { setColumns(form.columns.filter((_, x) => x !== i)); }
  function moveColumn(from, to) { if (to < 0 || to >= form.columns.length) return; const cs = form.columns.slice(); const [m] = cs.splice(from, 1); cs.splice(to, 0, m); setColumns(cs); }
  function updColumn(i, patch) { const cs = form.columns.slice(); cs[i] = { ...cs[i], ...patch }; setColumns(cs); }
  function addLink(ci) { updColumn(ci, { links: [...form.columns[ci].links, { id: rid(), label: "", url: "", enabled: true }] }); }
  function removeLink(ci, li) { updColumn(ci, { links: form.columns[ci].links.filter((_, x) => x !== li) }); }
  function updLink(ci, li, patch) { const links = form.columns[ci].links.slice(); links[li] = { ...links[li], ...patch }; updColumn(ci, { links }); }

  async function save(e) {
    e?.preventDefault?.(); setSaving(true); setMsg(null); setErr(null);
    try { const res = await apiClient.put(API_PATH, toPayload(form), { token: getToken() }); setForm(toForm(res?.footer)); setMsg("Saved."); }
    catch (e2) { if (e2 instanceof ApiError && e2.status === 401) { notifyUnauthorized(); return; } setErr(e2 instanceof ApiError ? e2.message : "Could not save the footer."); }
    finally { setSaving(false); }
  }

  if (loading) return <p className="footer-editor__status">Loading…</p>;
  if (!form) return <p className="footer-editor__status">{err || "Unavailable."}</p>;

  const previewSocial = form.social.filter((s) => s.url.trim());
  return (
    <div className="footer-editor">
      <header className="footer-editor__head">
        <h1>Footer Content</h1>
        <div className="footer-editor__actions">
          <button type="button" className="footer-editor__save" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
          {msg && <span className="footer-editor__ok">{msg}</span>}
          {err && <span className="footer-editor__err">{err}</span>}
        </div>
      </header>

      <section className="footer-card"><div className="footer-card__head"><h2>Live preview</h2></div>
        <div className="footer-editor__preview">
          <FooterView columns={form.columns.filter((c)=>c.enabled).map((c)=>({ id:c.id, title:c.title, links:c.links.filter((l)=>l.enabled).map((l)=>({id:l.id,label:l.label,url:l.url})) }))}
            newsletter={form.newsletter.enabled ? form.newsletter : undefined}
            membershipPromo={form.membershipPromo.enabled ? form.membershipPromo : undefined}
            social={previewSocial}
            bottomLinks={form.bottomLinks.filter((l)=>l.enabled)} copyrightText={form.copyrightText} />
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Settings</h2></div>
        <label className="footer-editor__check"><input type="checkbox" checked={form.enabled} onChange={(e)=>set({enabled:e.target.checked})} /> Enable footer</label>
      </section>

      <section className="footer-card">
        <div className="footer-card__head"><h2>Navigation columns</h2><button type="button" className="footer-editor__add" onClick={addColumn}>Add column</button></div>
        <div className="footer-editor__cols">
          {form.columns.map((c, ci) => (
            <div key={c.id} className="footer-editor__col">
              <div className="footer-editor__col-bar">
                <button type="button" aria-label={`Move up column ${ci+1}`} onClick={()=>moveColumn(ci, ci-1)} disabled={ci===0}>↑</button>
                <button type="button" aria-label={`Move down column ${ci+1}`} onClick={()=>moveColumn(ci, ci+1)} disabled={ci===form.columns.length-1}>↓</button>
                <button type="button" aria-label={`Remove column ${ci+1}`} onClick={()=>removeColumn(ci)}>✕</button>
              </div>
              <label className="footer-editor__field"><span>Column {ci+1} title</span>
                <input type="text" value={c.title} onChange={(e)=>updColumn(ci, { title: e.target.value })} /></label>
              <ul className="footer-editor__links">
                {c.links.map((l, li) => (
                  <li key={l.id} className="footer-editor__link-row">
                    <label className="footer-editor__field"><span>Column {ci+1} link {li+1} label</span>
                      <input type="text" value={l.label} onChange={(e)=>updLink(ci, li, { label: e.target.value })} /></label>
                    <label className="footer-editor__field"><span>Column {ci+1} link {li+1} url</span>
                      <input type="text" value={l.url} onChange={(e)=>updLink(ci, li, { url: e.target.value })} /></label>
                    <button type="button" aria-label={`Remove column ${ci+1} link ${li+1}`} onClick={()=>removeLink(ci, li)}>✕</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="footer-editor__add" aria-label={`Add link to column ${ci+1}`} onClick={()=>addLink(ci)}>Add link</button>
            </div>
          ))}
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Newsletter</h2></div>
        <div className="footer-editor__grid">
          <label className="footer-editor__check"><input type="checkbox" checked={form.newsletter.enabled} onChange={(e)=>set({newsletter:{...form.newsletter,enabled:e.target.checked}})} /> Enabled</label>
          <label className="footer-editor__field"><span>Title</span><input value={form.newsletter.title} onChange={(e)=>set({newsletter:{...form.newsletter,title:e.target.value}})} /></label>
          <label className="footer-editor__field footer-editor__field--wide"><span>Subtitle</span><input value={form.newsletter.subtitle} onChange={(e)=>set({newsletter:{...form.newsletter,subtitle:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Placeholder</span><input value={form.newsletter.placeholder} onChange={(e)=>set({newsletter:{...form.newsletter,placeholder:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Button label</span><input value={form.newsletter.buttonLabel} onChange={(e)=>set({newsletter:{...form.newsletter,buttonLabel:e.target.value}})} /></label>
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Membership promo</h2></div>
        <div className="footer-editor__grid">
          <label className="footer-editor__check"><input type="checkbox" checked={form.membershipPromo.enabled} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,enabled:e.target.checked}})} /> Enabled</label>
          <label className="footer-editor__field"><span>Title</span><input value={form.membershipPromo.title} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,title:e.target.value}})} /></label>
          <label className="footer-editor__field footer-editor__field--wide"><span>Description</span><input value={form.membershipPromo.description} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,description:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Button label</span><input value={form.membershipPromo.buttonLabel} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,buttonLabel:e.target.value}})} /></label>
          <label className="footer-editor__field"><span>Button URL</span><input value={form.membershipPromo.buttonUrl} onChange={(e)=>set({membershipPromo:{...form.membershipPromo,buttonUrl:e.target.value}})} /></label>
        </div>
      </section>

      <section className="footer-card"><div className="footer-card__head"><h2>Social links</h2></div>
        <div className="footer-editor__grid">
          {form.social.map((s, i) => (
            <label key={s.platform} className="footer-editor__field"><span>{s.platform}</span>
              <input value={s.url} placeholder="https://…" onChange={(e)=>{ const social=form.social.slice(); social[i]={...s,url:e.target.value}; set({social}); }} /></label>
          ))}
        </div>
      </section>

      <section className="footer-card">
        <div className="footer-card__head"><h2>Bottom bar</h2>
          <button type="button" className="footer-editor__add" onClick={()=>set({bottomLinks:[...form.bottomLinks,{id:rid(),label:"",url:"",enabled:true}]})}>Add link</button></div>
        <ul className="footer-editor__list">
          {form.bottomLinks.map((l, i) => (
            <li key={l.id} className="footer-editor__grid footer-editor__item">
              <label className="footer-editor__field"><span>Label</span><input value={l.label} onChange={(e)=>{ const bl=form.bottomLinks.slice(); bl[i]={...l,label:e.target.value}; set({bottomLinks:bl}); }} /></label>
              <label className="footer-editor__field"><span>URL</span><input value={l.url} onChange={(e)=>{ const bl=form.bottomLinks.slice(); bl[i]={...l,url:e.target.value}; set({bottomLinks:bl}); }} /></label>
              <button type="button" aria-label={`Remove bottom link ${i+1}`} onClick={()=>set({bottomLinks:form.bottomLinks.filter((_,x)=>x!==i)})}>✕</button>
            </li>
          ))}
        </ul>
        <label className="footer-editor__field"><span>Copyright text</span>
          <input value={form.copyrightText} onChange={(e)=>set({copyrightText:e.target.value})} placeholder="© 2026 Planet of Toys. All rights reserved." /></label>
      </section>
    </div>
  );
}
