// Kafka连接状态更新函数
function updateKafkaConnectionStatus(isConnected) {
    if (isConnected) {
        kafkaConnectionStatus.className = 'status-indicator status-connected';
        kafkaConnectionText.textContent = '已连接';
    } else {
        kafkaConnectionStatus.className = 'status-indicator status-disconnected';
        kafkaConnectionText.textContent = '未连接';
    }
}

// 处理Kafka消息的回调函数（供kafkaDataParser调用）
function handleKafkaParsedData(data) {
    try {
        // 处理卫星状态数据（与原WebSocket消息处理逻辑保持一致）
        if (data.StateData || data.states) {
            updateSatellite(data);
            // 更新卫星数量显示
            const friendCount = data.states?.friends?.length || 0;
            const enemyCount = data.states?.enemies?.length || 0;
            satelliteCount.textContent = friendCount + enemyCount;
        }

        // 更新场景信息
        if (data.scene_id) {
            currentScene.textContent = data.scene_id;
        }

        // 更新仿真时间
        if (data.t !== undefined) {
            simulationTime.textContent = data.t + ' s';
        }

        // 处理错误消息
        if (data.error) {
            console.error('Kafka消息错误:', data.error);
            // 可添加错误信息DOM显示逻辑
        }

        // 处理协同观测成功状态
        if (data.collaborative_observation_success) {
            showScanCones = true;
        }

    } catch (error) {
        console.error('处理Kafka解析后数据错误:', error);
    }
}

