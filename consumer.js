const TARGET_TOPIC = [
  'scene.configs', 'sat.state', 'sat.command', 'enemy.command',
  'sat.keep', 'enemy.keep', 'sat.keep.phase3', 'sat.game',
  'sat.task', 'missionlist', 'ground.tasks', 'sat.phase2.req',
  'sat.phase2.res', 'sat.cbba.req', 'sat.cbba.res', 'sat.link',
  'sat.capture','sat.perception'
]; 

// ================= 播放控制参数 =================
let currentFPS = 30; // 默认物理帧率
let currentDT = 1.0; // 🚀 新增：严格的单帧仿真步长 (Fixed Step)
const WS_PORT = 8081; 
const KAFKA_GROUP_ID = 'js-sat-state-consumer-group-1';
const MAX_QUEUE = 5000;    
const RESUME_QUEUE = 2000; 

const { Kafka } = require('kafkajs');
const WebSocket = require('ws'); 

const KAFKA_CONFIG = {
  clientId: 'js-sat-state-consumer',
  brokers: ['192.168.5.82:9092'], // 师兄电脑IP
  //brokers: ['192.168.5.116:9092'],
  //brokers: ['localhost:9092'], 
  retry: { initialRetryTime: 1000, retries: 10 }
};

const wss = new WebSocket.Server({ port: WS_PORT });
console.log(`WebSocket服务器已启动, 监听端口${WS_PORT}`);

const activeWsClients = new Set();
let consumerPaused = false;
const frameQueue = []; 
let playbackTimer = null;
let isPlaying = false; 

// 探针专用变量
let debug_lastKafkaTime = -1;
let debug_engineTickCount = 0;
let debug_droppedFrames = 0;

wss.on('connection', (ws) => {
  console.log('新的前端cesium客户端已连接');
  activeWsClients.add(ws);
  
  ws.on('close', () => activeWsClients.delete(ws));
  ws.on('error', () => activeWsClients.delete(ws));

  ws.on('message', (buf) => {
    try {
      const obj = JSON.parse(buf.toString('utf8'));
      
      if (obj.cmd === 'playback_config') {
        currentFPS = obj.fps || 30;
        currentDT = obj.dt || 1.0; // 🚀 获取并保存独立的步长

        console.log(`\n===========================================`);
        console.log(`[配置更新] 严格物理帧率: ${currentFPS} FPS | 每帧强制跨越: ${currentDT} s`);
        console.log(`===========================================\n`);
        
        // 如果正在播放，必须重启引擎以应用新的频率和步长
        if (isPlaying) {
            startPlaybackEngine(); 
        }
      }

      else if (obj.cmd === 'pause') {
        isPlaying = false;
        console.log('[控制] 收到前端 暂停 指令');
      } 
      else if (obj.cmd === 'resume') {
        if (!isPlaying) {
            isPlaying = true;
            console.log('[控制] 收到前端 播放 指令');
        }
      }
    } catch(err) {
      console.error('解析前端指令失败:', err.message);
    }
  });
});

function broadcastFrame(frameStr) {
  for (const client of activeWsClients) {
    if (client.readyState === WebSocket.OPEN) client.send(frameStr);
  }
}

// ==========================================================
// 🚀 核心引擎重构：绝对固定步长 (Fixed Step Playback)
// ==========================================================
let currentSimTime = null;

function startPlaybackEngine() {
  if (playbackTimer) clearInterval(playbackTimer);

  const intervalMs = Math.max(1, Math.floor(1000 / currentFPS));

  playbackTimer = setInterval(() => {
    debug_engineTickCount++;

    if (!isPlaying || activeWsClients.size === 0) {
        return;
    }

    if (frameQueue.length === 0) {
        if (debug_engineTickCount % 30 === 0) {
            console.warn(`[引擎饥饿] 队列为空！系统正在等待C++发送新数据...`);
        }
        return; // 数据不足时直接返回，时间指针冻结，绝不空走！
    }

    // 初始化起点
    if (currentSimTime === null) {
        currentSimTime = frameQueue[0].t;
    } else {
        // 🚀 核心改变：不管底层硬件卡不卡，时间指针直接加上你设定的准确数字（例如 +3.0）
        currentSimTime += currentDT;
    }

    let frameToSend = null;
    let localDropped = 0;

    // 🚀 取出小于等于指针的最新一帧（加 1e-3 防止 JavaScript 浮点数精度误差，如 3.0000000000004 <= 3）
    while (frameQueue.length > 0 && frameQueue[0].t <= currentSimTime + 1e-3) {
        frameToSend = frameQueue.shift();
        localDropped++;
    }
    debug_droppedFrames += (localDropped > 1 ? localDropped - 1 : 0);

    if (frameToSend) {
        broadcastFrame(frameToSend.data);
        // 兜底同步：如果抽帧过快导致指针远超数据流，强行把指针按在最新的数据上
        if (frameQueue.length === 0) {
            currentSimTime = frameToSend.t; 
        }
    }

    if (consumerPaused && frameQueue.length < RESUME_QUEUE) {
      consumer.resume([{ topic: 'sat.state' }]);
      consumerPaused = false;
    }

    if (debug_engineTickCount % 30 === 0) {
        console.log(`[引擎心跳] 每帧跨度: ${currentDT}s | 队列: ${frameQueue.length}帧 | 内部时间指针: ${currentSimTime.toFixed(1)}s`);
        debug_droppedFrames = 0; 
    }

  }, intervalMs); 
}

const kafka = new Kafka(KAFKA_CONFIG);
const consumer = kafka.consumer({groupId: KAFKA_GROUP_ID});

async function consumeAndForwardMessages() {
  try {
    await consumer.connect();
    console.log('Kafka消费者已成功连接');

    await consumer.subscribe({ topics: TARGET_TOPIC, fromBeginning: true });

    let lastT = null;

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        if (!message.value) return;
        const kafkaMsgStr = message.value.toString('utf8').trim();
        if (!kafkaMsgStr) return;

        let t;
        try {
          const obj = JSON.parse(kafkaMsgStr);

          // ================= 核心改造：强行打上主题烙印 =================
          obj.kafka_topic = topic; // 把主题名作为新字段注入到数据体内
          const modifiedMsgStr = JSON.stringify(obj); // 重新打包成字符串
          // =================================================================


          if (topic !== 'sat.state') {
              broadcastFrame(modifiedMsgStr); // 发送打过标签的新数据
              return;
          }
          t = Number(obj.t);
          if (!Number.isFinite(t)) return;

          debug_lastKafkaTime = t; 

          if (lastT !== null && t < lastT - 1.0) {
              console.log('[Player] 仿真重启，重置时间轴');
              frameQueue.length = 0; 
              currentSimTime = null; 
          }
          lastT = t; 

          // 高频队列也存入打过标签的新数据
          frameQueue.push({ t: t, data: modifiedMsgStr });

        } catch(err) { return; }

        frameQueue.push({ t: t, data: kafkaMsgStr });

        if (!consumerPaused && frameQueue.length > MAX_QUEUE) {
          consumer.pause([{ topic: 'sat.state' }]); 
          consumerPaused = true;
          // console.log('[Kafka] pause, q=', frameQueue.length);
        }
      }
    });
  } catch (err) {
    console.error('Kafka异常:', err.message);
    await consumer.disconnect().catch(() => {});
    setTimeout(consumeAndForwardMessages, 3000);
  }
}

process.on('SIGINT', async () => {
  await consumer.disconnect().catch(() => {});
  wss.close();
  process.exit(0);
});

consumeAndForwardMessages();
startPlaybackEngine();