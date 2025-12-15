# wa-forwarder

Бот для копіювання повідомлень з вибраних WhatsApp-груп у одну цільову групу + простий веб‑інтерфейс налаштувань.

## Швидкий старт (локально)

1. Встанови Node.js (рекомендовано LTS).
2. Встанови залежності:
   - `npm install`
3. Створи `.env` (можна з прикладу):
   - `copy .env.example .env` (Windows)
   - `cp .env.example .env` (Linux/macOS)
4. Запусти:
   - `npm start`
5. Відкрий веб‑інтерфейс:
   - `http://127.0.0.1:3000/`

Перший запуск попросить авторизацію WhatsApp — QR буде виведений у консоль. Після логіну сесія збережеться в `.wwebjs_auth/`.

## Деплой на Linux (сервер)

1) Підготуй середовище  
   ```bash
   sudo apt update
   sudo apt install -y curl ca-certificates fonts-noto-color-emoji
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo apt install -y chromium-browser    # або встанови Google Chrome/Edge
   ```
   Якщо ставиш свій браузер, запам’ятай шлях (наприклад `/usr/bin/chromium` або `/usr/bin/google-chrome`).

2) Розгорни код  
   ```bash
   cd /opt
   git clone <repo-url> wa-forwarder
   cd wa-forwarder
   npm ci --omit=dev
   cp .env.example .env
   ```
   Заповни `.env`:  
   - `KEYWORDS`, `SOURCE_CHATS`, `TARGET_CHAT` (початкові значення).  
   - `HEADLESS=1` на сервері без GUI.  
   - `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` (або шлях до Chrome/Edge, якщо потрібен власний браузер).  
   - `WEB_BIND=0.0.0.0` якщо треба доступ з мережі; не забудь відкрити `WEB_PORT` у фаєрволі.

3) Перший запуск і авторизація  
   ```bash
   npm start
   ```
   У консолі з’явиться QR-код для входу в WhatsApp. Після входу сесія збережеться в `.wwebjs_auth/`, повторно сканувати не треба.

4) Автозапуск через systemd (приклад)  
   ```ini
   [Unit]
   Description=WA Forwarder
   After=network.target

   [Service]
   WorkingDirectory=/opt/wa-forwarder
   ExecStart=/usr/bin/node index.js
   Environment=NODE_ENV=production
   EnvironmentFile=/opt/wa-forwarder/.env
   Restart=on-failure
   User=wa
   Group=wa

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now wa-forwarder
   ```
   Перевірка статусу: `sudo systemctl status wa-forwarder`.

5) Доступ з мережі  
   - Вкажи `WEB_BIND=0.0.0.0` і, за потреби, змінюй `WEB_PORT`.  
   - Додай правило фаєрвола: `sudo ufw allow 3000/tcp` (або свій порт).  
   - Відкрий `http://<ip-сервера>:<порт>/`.
