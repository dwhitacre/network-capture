import { $, ShellError } from "bun";

const ELASTICSEARCH_URL = "http://localhost:9200/speedtest/_doc/";
const INTERVAL_MS = 30000;
const RUN_FOREVER = false;

interface SpeedTestResultLatency {
  low: number;
  high: number;
  jitter: number;
}

interface SpeedTestResultSpeed {
  bandwidth: number;
  bytes: number;
  elapsed: number;
  latency: { iqm: number } & SpeedTestResultLatency;
}

interface SpeedTestResult {
  type: string;
  timestamp: string;
  ping: { latency: number } & SpeedTestResultLatency;
  download: SpeedTestResultSpeed;
  upload: SpeedTestResultSpeed;
  packetLoss: number;
  isp: string;
  interface: {
    internalIp: string;
    name: string;
    macAddr: string;
    isVpn: boolean;
    externalIp: string;
  };
  server: {
    id: number;
    host: string;
    port: number;
    name: string;
    location: string;
    country: string;
    ip: string;
  };
  result: {
    id: string;
    url: string;
    persisted: boolean;
  };
}

async function runSpeedTest(): Promise<SpeedTestResult | undefined> {
  console.log("Running speedtest...");

  let output = "";
  try {
    output = await $`speedtest -f json`.text();
    return JSON.parse(output) as SpeedTestResult;
  } catch (err: unknown) {
    if (err instanceof ShellError) {
      console.error(`Failed with code ${err.exitCode}`);
      console.error(err.stdout.toString());
      console.error(err.stderr.toString());
    } else {
      console.error("Failed to parse JSON output:");
      console.error(err);
      console.error(output);
    }
  }
  return undefined;
}

async function sendToElasticsearch(data: SpeedTestResult) {
  try {
    const response = await fetch(ELASTICSEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.error(
        "Failed to send data to Elasticsearch:",
        response.statusText
      );
    }
  } catch (error) {
    console.error("Failed to send to elasticsearch:", error);
  }
}

async function main() {
  while (true) {
    const data = await runSpeedTest();
    if (data) {
      console.log("Speedtest result captured: ", data.timestamp);
      await sendToElasticsearch(data);
    } else {
      console.error("Failed to run speedtest");
    }

    await Bun.sleep(INTERVAL_MS);

    if (!RUN_FOREVER) {
      break;
    }
  }
}

main().catch((error) => console.error("Unexpected error:", error));
