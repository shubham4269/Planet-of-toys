# Deploying Planet of Toys to a Hostinger VPS

Architecture on the VPS:

```
Internet → nginx (port 80/443)
            ├─ serves client/dist (the built React app, funnel URLs only — others get HTTP 403)
            └─ /api/* → Node/Express via PM2 (port 4000) → MongoDB
```

## 1. One-time VPS setup

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# PM2 keeps the API running and restarts it on reboot/crash
sudo npm install -g pm2
```

MongoDB: either install locally (`mongodb-org`) or use a free MongoDB Atlas
cluster and put its connection string in `MONGODB_URI` (Atlas is simpler to
back up and secure).

## 2. Get the code onto the VPS

```bash
sudo mkdir -p /var/www/planet-of-toys
sudo chown $USER /var/www/planet-of-toys
# upload via git clone, scp, or rsync into /var/www/planet-of-toys
```

## 3. Server (API)

```bash
cd /var/www/planet-of-toys/server
npm ci --omit=dev
```

Create `/var/www/planet-of-toys/server/.env`:

```env
NODE_ENV=production
PORT=4000

# Required — the app refuses to start without these (see src/config/env.js)
MONGODB_URI=mongodb+srv://...        # or mongodb://127.0.0.1:27017/planet-of-toys
JWT_SECRET=<long random string>
ENCRYPTION_KEY=<long random string>

# CORS — must match the public site origin exactly
ALLOWED_ORIGINS=https://YOURDOMAIN.com,https://www.YOURDOMAIN.com
```

Generate the secrets with: `openssl rand -hex 32` (run twice, one per secret).

Start under PM2:

```bash
pm2 start src/index.js --name planet-of-toys-api
pm2 save
pm2 startup    # prints a command — run it so the API survives reboots
```

## 4. Client (React build)

The API URL and Meta Pixel ID are baked in at build time:

```bash
cd /var/www/planet-of-toys/client
npm ci
VITE_API_BASE_URL=https://YOURDOMAIN.com VITE_META_PIXEL_ID=<your pixel id> npm run build
```

This produces `client/dist`, which nginx serves directly. Rebuild whenever the
client code, the domain, or the pixel ID changes.

## 5. nginx (serving + the real HTTP 403)

Edit `deploy/nginx-planet-of-toys.conf` — replace `YOURDOMAIN.com` — then:

```bash
sudo cp deploy/nginx-planet-of-toys.conf /etc/nginx/sites-available/planet-of-toys
sudo ln -s /etc/nginx/sites-available/planet-of-toys /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Only these URLs are reachable; everything else returns HTTP 403 with the
branded React 403 page:

- `/checkout` and `/checkout/<product-slug>` (all products)
- `/order/success`
- `/privacy-policy`, `/refund-policy`, `/shipping-policy`, `/terms-of-service`
- `/admin` (protected by its own login)
- `/api/*` (the backend, including the Razorpay webhook)

## 6. HTTPS (required for Razorpay + Meta Pixel)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOURDOMAIN.com -d www.YOURDOMAIN.com
```

Certbot rewrites the nginx config for SSL and auto-renews.

## 7. Post-deploy checklist

- [ ] `https://YOURDOMAIN.com/checkout/<slug>` loads each of the 4 products
- [ ] `https://YOURDOMAIN.com/` returns **403** (check with `curl -I`)
- [ ] Policy pages load from the checkout footer
- [ ] `/admin` login works; products/orders visible
- [ ] Razorpay webhook URL updated in the Razorpay dashboard to
      `https://YOURDOMAIN.com/api/webhooks/...`
- [ ] Test one online payment and one COD order end to end
- [ ] WhatsApp buttons point to your real number (`https://wa.me/91XXXXXXXXXX`)

## Updating the site later

```bash
cd /var/www/planet-of-toys
git pull                                   # or re-upload files
cd server && npm ci --omit=dev && pm2 restart planet-of-toys-api
cd ../client && npm ci && VITE_API_BASE_URL=https://YOURDOMAIN.com VITE_META_PIXEL_ID=<pixel id> npm run build
```

No nginx change needed for code updates (only for domain/routing changes).
