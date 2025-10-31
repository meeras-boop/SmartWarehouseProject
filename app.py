from flask import Flask, render_template, jsonify
import paho.mqtt.client as mqtt
import json
import RPi.GPIO as GPIO
import sqlite3
import threading
import time

app = Flask(__name__)

# GPIO Setup
BUZZER_PIN = 18
LED_PIN = 24
GPIO.setmode(GPIO.BCM)
GPIO.setup(BUZZER_PIN, GPIO.OUT)
GPIO.setup(LED_PIN, GPIO.OUT)
GPIO.output(BUZZER_PIN, GPIO.LOW)
GPIO.output(LED_PIN, GPIO.LOW)

# MQTT Configuration
MQTT_BROKER = "localhost"
MQTT_PORT = 1883

# Global data storage
sensor_data = {
    'shelf1': {
        'weight': 0.0,
        'distance': 100,
        'items': 0,
        'last_update': None
    }
}
security_alerts = []

# Initialize Database
def init_db():
    conn = sqlite3.connect('warehouse.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS sensor_data
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  shelf_id TEXT,
                  weight REAL,
                  distance INTEGER,
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS alerts
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  type TEXT,
                  message TEXT,
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

# MQTT Callbacks
def on_connect(client, userdata, flags, rc):
    print("Connected to MQTT broker with result code " + str(rc))
    client.subscribe("warehouse/#")

def on_message(client, userdata, msg):
    global sensor_data, security_alerts
    
    topic = msg.topic
    payload = msg.payload.decode()
    
    try:
        if 'weight' in topic:
            weight = float(payload)
            sensor_data['shelf1']['weight'] = weight
            sensor_data['shelf1']['items'] = int(weight / 0.5)  # Assuming 0.5kg per item
            sensor_data['shelf1']['last_update'] = time.time()
            
            # Save to database
            save_sensor_data('shelf1', weight, sensor_data['shelf1']['distance'])
            
            # Check for low stock
            if weight < 2.0:  # 2kg threshold
                trigger_alert('stock', f'Shelf 1 is low on stock! Current weight: {weight}kg')
                
        elif 'distance' in topic:
            distance = int(payload)
            sensor_data['shelf1']['distance'] = distance
            sensor_data['shelf1']['last_update'] = time.time()
            
        elif 'pir' in topic:
            if payload == '1':
                trigger_alert('security', 'Unauthorized motion detected in warehouse!')
                activate_alarm()
                
        elif 'rfid' in topic:
            rfid_data = payload
            log_rfid_scan(rfid_data)
            
    except Exception as e:
        print(f"Error processing MQTT message: {e}")

def save_sensor_data(shelf_id, weight, distance):
    conn = sqlite3.connect('warehouse.db')
    c = conn.cursor()
    c.execute("INSERT INTO sensor_data (shelf_id, weight, distance) VALUES (?, ?, ?)",
              (shelf_id, weight, distance))
    conn.commit()
    conn.close()

def trigger_alert(alert_type, message):
    alert = {
        'type': alert_type,
        'message': message,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
    }
    security_alerts.append(alert)
    
    # Save to database
    conn = sqlite3.connect('warehouse.db')
    c = conn.cursor()
    c.execute("INSERT INTO alerts (type, message) VALUES (?, ?)",
              (alert_type, message))
    conn.commit()
    conn.close()
    
    # Keep only last 50 alerts in memory
    if len(security_alerts) > 50:
        security_alerts.pop(0)

def activate_alarm():
    # Flash LED and sound buzzer
    def alarm_sequence():
        for _ in range(10):
            GPIO.output(BUZZER_PIN, GPIO.HIGH)
            GPIO.output(LED_PIN, GPIO.HIGH)
            time.sleep(0.5)
            GPIO.output(BUZZER_PIN, GPIO.LOW)
            GPIO.output(LED_PIN, GPIO.LOW)
            time.sleep(0.5)
    
    alarm_thread = threading.Thread(target=alarm_sequence)
    alarm_thread.start()

def log_rfid_scan(rfid_data):
    print(f"RFID Scan: {rfid_data}")
    # You can save this to database as well

# Flask Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/dashboard_data')
def get_dashboard_data():
    return jsonify({
        'sensor_data': sensor_data,
        'alerts': security_alerts[-10:],  # Last 10 alerts
        'system_status': 'online'
    })

@app.route('/api/history/<shelf_id>')
def get_history(shelf_id):
    conn = sqlite3.connect('warehouse.db')
    c = conn.cursor()
    c.execute("SELECT weight, distance, timestamp FROM sensor_data WHERE shelf_id = ? ORDER BY timestamp DESC LIMIT 50", (shelf_id,))
    data = c.fetchall()
    conn.close()
    
    history = [{'weight': row[0], 'distance': row[1], 'timestamp': row[2]} for row in data]
    return jsonify(history)

def start_mqtt_client():
    mqtt_client = mqtt.Client()
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_forever()

if __name__ == '__main__':
    init_db()
    
    # Start MQTT client in a separate thread
    mqtt_thread = threading.Thread(target=start_mqtt_client)
    mqtt_thread.daemon = True
    mqtt_thread.start()
    
    # Start Flask app
    app.run(host='0.0.0.0', port=5000, debug=False)
