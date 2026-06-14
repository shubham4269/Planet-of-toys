export function createNewsletterController(newsletterService) {
  /** POST /subscribe — public. Captures ip/userAgent; never leaks them back. */
  async function subscribe(req, res, next) {
    try {
      const { email, source } = req.body ?? {};
      const result = await newsletterService.subscribe({
        email, source,
        ipAddress: req.ip ?? null,
        userAgent: req.get?.("user-agent") ?? null,
      });
      res.json({ ok: true, already: result.already });
    } catch (err) { next(err); }
  }
  /** GET /subscribers — admin list. */
  async function list(req, res, next) {
    try {
      const { search, status, page, limit } = req.query ?? {};
      res.json(await newsletterService.listSubscribers({ search, status, page, limit }));
    } catch (err) { next(err); }
  }
  /** GET /subscribers/export — admin CSV download. */
  async function exportCsv(req, res, next) {
    try {
      const { search, status } = req.query ?? {};
      const csv = await newsletterService.exportCsv({ search, status });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="subscribers.csv"');
      res.send(csv);
    } catch (err) { next(err); }
  }
  /** PATCH /subscribers/:id/unsubscribe — admin. */
  async function unsubscribe(req, res, next) {
    try { res.json({ subscriber: await newsletterService.unsubscribe(req.params.id) }); } catch (err) { next(err); }
  }
  return { subscribe, list, exportCsv, unsubscribe };
}
export default createNewsletterController;
