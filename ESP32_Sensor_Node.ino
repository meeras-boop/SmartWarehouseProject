#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include "HX711.h"
#include "credentials.h"

// Pin Definitions
#define RFID_SS_PIN 5
#define RFID_RST_PIN 4
#define LOADCELL_DOUT_PIN 21
#define LOADCELL_SCK_PIN 22
#define TRIG_PIN 13
#define ECHO_PIN 12
#define PIR_PIN 14

// Objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
HX711 scale;

// Variables
unsigned long lastMsg = 0;
const long interval = 5000; // Send data every 5 seconds
bool pirState = false;
bool lastPirState = false;
float calibration_factor = -96650; // Calibrate this for your load cell

void setup() {
  Serial.begin(115200);
  
  // Initialize components
  setupWiFi();
  setupMQTT();
  setupRFID();
  setupWeightSensor();
  setupUltrasonic();
  setupPIRSensor();
}

void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastMsg > interval) {
    lastMsg = now;
    
    // Read and send sensor data
    readAndSendWeight();
    readAndSendDistance();
    readAndSendPIR();
  }
  
  // Check RFID continuously
  checkRFID();
}

void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void setupMQTT() {
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
}

void setupRFID() {
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("RFID reader initialized");
}

void setupWeightSensor() {
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(calibration_factor);
  scale.tare(); // Reset the scale to 0
  Serial.println("Weight sensor initialized");
}

void setupUltrasonic() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  Serial.println("Ultrasonic sensor initialized");
}

void setupPIRSensor() {
  pinMode(PIR_PIN, INPUT);
  Serial.println("PIR sensor initialized");
}

void mqttCallback(char* topic, byte* message, unsigned int length) {
  // Handle incoming MQTT messages if needed
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void readAndSendWeight() {
  if (scale.is_ready()) {
    float weight = scale.get_units(5); // Average of 5 readings
    char weightStr[10];
    dtostrf(weight, 4, 2, weightStr);
    
    mqttClient.publish("warehouse/shelf1/weight", weightStr);
    Serial.print("Weight: ");
    Serial.println(weightStr);
  }
}

void readAndSendDistance() {
  // Send ultrasonic pulse
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // Read echo pulse
  long duration = pulseIn(ECHO_PIN, HIGH);
  int distance = duration * 0.034 / 2;
  
  char distanceStr[10];
  sprintf(distanceStr, "%d", distance);
  
  mqttClient.publish("warehouse/shelf1/distance", distanceStr);
  Serial.print("Distance: ");
  Serial.println(distanceStr);
}

void readAndSendPIR() {
  pirState = digitalRead(PIR_PIN);
  
  if (pirState != lastPirState) {
    if (pirState) {
      mqttClient.publish("warehouse/security/pir", "1");
      Serial.println("Motion detected!");
    } else {
      mqttClient.publish("warehouse/security/pir", "0");
    }
    lastPirState = pirState;
  }
}

void checkRFID() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;
  
  String rfidUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    rfidUID += String(rfid.uid.uidByte[i] < 0x10 ? "0" : "");
    rfidUID += String(rfid.uid.uidByte[i], HEX);
  }
  
  mqttClient.publish("warehouse/entry/rfid", rfidUID.c_str());
  Serial.print("RFID Scanned: ");
  Serial.println(rfidUID);
  
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
