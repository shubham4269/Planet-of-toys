// apps/client/src/components/Footer.jsx
import { useEffect, useState } from "react";
import apiClient from "@planet-of-toys/shared-web/apiClient";
import { FooterView } from "@planet-of-toys/shared-web";
import "./Footer.css";

/**
 * Storefront footer: fetches the public footer, owns the newsletter submit, and
 * renders the shared FooterView. Renders nothing when disabled/empty or on
 * fetch failure — never blocks the page.
 */
export default function Footer() {
  const [footer, setFooter] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiClient.get("/api/content/footer")
      .then((res) => { if (active) setFooter(res?.footer ?? null); })
      .catch(() => { if (active) setFooter(null); });
    return () => { active = false; };
  }, []);

  if (!footer || !footer.enabled) return null;

  async function handleSubscribe(email) {
    setStatus("loading");
    setMessage("");
    try {
      await apiClient.post("/api/newsletter/subscribe", { email });
      setStatus("success");
      setMessage("Thanks for subscribing!");
    } catch {
      setStatus("error");
      setMessage("Sorry, that didn't work. Please try again.");
    }
  }

  return (
    <FooterView
      columns={footer.columns}
      newsletter={footer.newsletter}
      membershipPromo={footer.membershipPromo}
      social={footer.social}
      contact={footer.contact}
      trustHighlights={footer.trustHighlights}
      bottomLinks={footer.bottomLinks}
      copyrightText={footer.copyrightText}
      onSubscribe={handleSubscribe}
      status={status}
      message={message}
    />
  );
}
