let wsInstance = null;

const RenderManager = {
    isPaused: true,     
    processFrame: function(frameData) {
        if (this.isPaused) return; 
        KafkaDataParser.parseKafkaMessage(frameData);
    }
};

let debug_frontMsgCount = 0;
let debug_lastFrontT = -1;

function initWebSocket() {
    const ws = new WebSocket('ws://localhost:8081');
    wsInstance = ws; 

    ws.onopen = () => {
        console.log('WebSocket连接成功');
        if (typeof updateKafkaConnectionStatus === 'function') updateKafkaConnectionStatus(true); 
    };

    ws.onmessage = (event) => {
        if(!event.data) return;
        try {
            const data = JSON.parse(event.data);
            const currentTopic = data.kafka_topic; // 提取后端打上的主题烙印

            // ================= 🚀 全新架构：基于 Topic 的精准硬路由 =================
            if (currentTopic === 'sat.state' || data.states) { 
                RenderManager.processFrame(event.data);
                
                // 探针：监控前端真实收到的帧率
                debug_frontMsgCount++;
                if (debug_frontMsgCount % 30 === 0) {
                    debug_lastFrontT = data.t;
                }
            } 
            else if (currentTopic === 'scene.configs' || data.counts) { 
                if (typeof updateSceneHeader === 'function') updateSceneHeader(data);
            } 
            else if (currentTopic === 'missionlist') { 
                if (typeof updateMissionList === 'function') updateMissionList(data);
            } 
            else if (currentTopic === 'sat.link') { 
                if (typeof updateLinkStatus === 'function') updateLinkStatus(data);
            } 
            else if (currentTopic === 'sat.capture') { 
                if (typeof handleCaptureEvent === 'function') handleCaptureEvent(data);
            } 
            else if (currentTopic === 'sat.perception') { 
                if (typeof updatePerceptionErrors === 'function') updatePerceptionErrors(data);
            } 
            // 如果某些老旧格式没有被打上标签，尝试用旧特征匹配
            else if (data.event === "capture_progress") {
                if (typeof handleCaptureEvent === 'function') handleCaptureEvent(data);
            }

        } catch (err) {
            console.error('WebSocket消息处理失败:', err);
        }
    };

    ws.onclose = (event) => {
        console.log(`WebSocket连接关闭(${event.code}), 尝试重连...`);
        if (typeof updateKafkaConnectionStatus === 'function') updateKafkaConnectionStatus(false);
        wsInstance = null; 
        setTimeout(initWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket错误:', err);
        if (typeof updateKafkaConnectionStatus === 'function') updateKafkaConnectionStatus(false);
    };
}

document.addEventListener('DOMContentLoaded', () => {

    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            RenderManager.isPaused = !RenderManager.isPaused; 
            
            if (RenderManager.isPaused) {
                playPauseBtn.innerHTML = '▶'; 
                playPauseBtn.title = '开始渲染';
                if (typeof mainViewer !== 'undefined') mainViewer.clock.shouldAnimate = false;
                
                if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                    wsInstance.send(JSON.stringify({ cmd: 'pause' }));
                }
            } else {
                playPauseBtn.innerHTML = '⏸'; 
                playPauseBtn.title = '暂停渲染';
                if (typeof mainViewer !== 'undefined') mainViewer.clock.shouldAnimate = true;

                // 新增保护：恢复播放时，强行重置数据接收倒计时，防止瞬间触发任务结束
                window.lastSatStateRealTime = Date.now();

                if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                    wsInstance.send(JSON.stringify({ cmd: 'resume' }));
                }
            }
        });
    }

    
    const fpsDropdown = document.getElementById('fps-dropdown');
    const dtDropdown = document.getElementById('dt-dropdown');
    const currentSpeedText = document.getElementById('current-speed-text');

    function sendPlaybackConfig() {
        if (!fpsDropdown || !dtDropdown) return;
        
        const fps = parseInt(fpsDropdown.value);      // 物理帧率
        const dt = parseFloat(dtDropdown.value);      // 单帧流逝时间
        const totalSpeed = fps * dt;                  // 计算总倍速

        // 更新 UI 文本
        if (currentSpeedText) {
            currentSpeedText.textContent = totalSpeed;
        }
        
        console.log(`[UI交互] 更新配置: 帧率 ${fps}FPS, 步长 ${dt}s, 总倍速: ${totalSpeed}x`);
        
        // 发送给后端 Node.js
        if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
            wsInstance.send(JSON.stringify({ 
                cmd: 'playback_config', 
                fps: fps, 
                dt: dt, 
                speed: totalSpeed 
            }));
        }
        
        // 更新 Cesium 底层地球自转与动画倍速
        if (typeof mainViewer !== 'undefined') {
            mainViewer.clock.multiplier = totalSpeed;
        }
    }

    if (fpsDropdown && dtDropdown) {
        // 绑定任意一个下拉框的变化事件
        fpsDropdown.addEventListener('change', sendPlaybackConfig);
        dtDropdown.addEventListener('change', sendPlaybackConfig);
        
        // 页面刚加载时，主动计算默认值并同步给后端
        setTimeout(() => {
            sendPlaybackConfig();
            if (RenderManager.isPaused && wsInstance && wsInstance.readyState === WebSocket.OPEN) {
                wsInstance.send(JSON.stringify({ cmd: 'pause' }));
            }
        }, 1500); 
    }

    const setupAccordion = (headerId, contentId, iconId) => {
        const header = document.getElementById(headerId);
        const content = document.getElementById(contentId);
        const icon = document.getElementById(iconId);
        if (header && content && icon) {
            header.addEventListener('click', () => {
                const isExpanded = content.classList.contains('show');
                if (isExpanded) {
                    content.classList.remove('show');
                    header.classList.remove('expanded');
                    icon.textContent = '▼';
                } else {
                    content.classList.add('show');
                    header.classList.add('expanded');
                    icon.textContent = '▲';
                }
            });
        }
    };

    setupAccordion('mission-header', 'mission-content', 'mission-icon');
    setupAccordion('link-header', 'link-content', 'link-icon');
    setupAccordion('rel-dist-header', 'rel-dist-content', 'rel-dist-icon');
});