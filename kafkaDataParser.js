const sceneNameMap = {
    1: "子母式对星链",
    2: "分布式对星链",
    3: "天地互联式",
    4: "子母式对集群",
    5: "分布式对集群",
    6: "子母式对子母式"
};

/**
 * 处理 scene.configs 主题消息并更新顶部横栏
 * @param {Object} config 消息内容
 */
function updateSceneHeader(config) {
    if (!config) return;

    // 记录当前场景ID，供打击判定系统使用
    window.currentSceneId = config.scene_id;

    // 更新场景ID与名称
    document.getElementById('header-scene-id').textContent = config.scene_id || "-";
    document.getElementById('header-scene-name').textContent = sceneNameMap[config.scene_id] || "未知场景";

    // 格式化并更新时间 
    const startTime = config.epoch_utc ? config.epoch_utc.replace('T', ' ').replace('Z', '') : "-";
    const endTime = config.end_epoch_utc ? config.end_epoch_utc.replace('T', ' ').replace('Z', '') : "-";
    document.getElementById('header-start-time').textContent = startTime;
    document.getElementById('header-end-time').textContent = endTime;

    // 更新卫星数量 
    if (config.counts) {
        document.getElementById('header-friend-count').textContent = config.counts.friend || 0;
        document.getElementById('header-enemy-count').textContent = config.counts.enemy || 0;
    }

    // 调用渲染初始轨道表的函数
    renderInitialOrbitTables(config);

    // 根据配置信息中的场景ID更新图表可见性
    updateChartsVisibility(config.scene_id);
}

/**
 * 处理 missionlist 主题消息并更新右侧任务列表
 * @param {Object} data 包含 mission_list 的 JSON 数据
 */
function updateMissionList(data) {
  try{
    if (!data || !data.mission_list) return;

    const ul = document.getElementById('mission-list-ul');
    if (!ul) return;

    // 如果收到新任务数据，先清空列表
    ul.innerHTML = ''; 

    // 如果任务列表为空
    if (data.mission_list.length === 0) {
        ul.innerHTML = '<li class="empty-tip">暂无任务数据</li>';
        return;
    }

    // 🚀 【新增核心逻辑】将任务数组按 start_time 从小到大（时间先后）进行排序
    data.mission_list.sort((a, b) => {
        // 如果 start_time 不存在，为了防止报错，给个默认值 0
        const timeA = a.start_time || 0;
        const timeB = b.start_time || 0;
        return timeA - timeB; 
    });


    // // 遍历每一个任务，生成动态的列表项
    // data.mission_list.forEach(mission => {
    //     const li = document.createElement('li');
    //     // 使用您在 style.css 中已经定义好的我方(黄)和敌方(红)的颜色类
    //     li.innerHTML = `
    //         <div>我方 <span class="count-friend">${mission.friend_id}号星</span> ——> 敌方 <span class="count-enemy">${mission.target_id}号星</span></div>
    //         <div style="color: #aaa; font-size: 12px; margin-top: 4px;">
    //             ▶ 预计执行时刻: <span style="color: #fff">${mission.start_time.toFixed(1)} s</span>
    //         </div>
    //     `;

    //     // ================= 🚀 新增交互事件绑定 🚀 =================
    //     // 为每个列表项绑定鼠标点击事件
    //     li.onclick = function() {
    //         if (typeof toggleHighlightMission === 'function') {
    //             // 调用 sat_orbit.js 中的高亮切换函数
    //             toggleHighlightMission(mission.friend_id, mission.target_id, li);
    //         } else {
    //             console.error("未找到 toggleHighlightMission 函数，请确认 sat_orbit.js 已正确加载。");
    //         }
    //     };
    //     // =========================================================

    //     ul.appendChild(li);
    // });


    // 🚀 新增：初始化全局任务注册表 (若没有则创建)
    window.MissionRegistry = window.MissionRegistry || new Map();

    // 遍历每一个任务，生成动态的列表项
    data.mission_list.forEach(mission => {
      const missionKey = `${mission.friend_id}-${mission.target_id}`; // 唯一键值
        
      // 如果是新任务，注册进状态机
      if (!window.MissionRegistry.has(missionKey)) {
          window.MissionRegistry.set(missionKey, {
              friend_id: mission.friend_id,
              target_id: mission.target_id,
              start_time: mission.start_time,
              status: 'pending' // 状态： pending(等待中) -> striking(打击中) -> destroyed(已摧毁)
          });
      }
      
      const missionState = window.MissionRegistry.get(missionKey);

      const li = document.createElement('li');
      li.innerHTML = `
          <div>我方 <span class="count-friend">${mission.friend_id}号星</span> ——> 敌方 <span class="count-enemy">${mission.target_id}号星</span></div>
          <div style="color: #aaa; font-size: 12px; margin-top: 4px;">
              ▶ 开始执行时刻: <span style="color: #fff">${mission.start_time.toFixed(1)} s</span>
          </div>
      `;

      // 🚀 根据内存中的真实状态，重绘 UI 样式
      if (missionState.status === 'destroyed') {
          li.classList.add('mission-completed');
      } else if (missionState.status === 'striking') {
          li.classList.add('mission-striking');
      }

      // 把最新的 DOM 元素挂载到注册表中，方便跨文件控制
      missionState.liElement = li; 

      // 只有非摧毁状态才能点击交互
      li.onclick = function() {
          if (missionState.status !== 'destroyed' && typeof toggleHighlightMission === 'function') {
              toggleHighlightMission(mission.friend_id, mission.target_id, li);
          }
      };

      ul.appendChild(li);
    });


  }catch(err){
    console.error("❌ [任务列表渲染崩溃] updateMissionList 内部发生严重错误！");
    console.error("错误信息:", err.message);
    console.error("错误堆栈:", err.stack);
  }
}


/**
 * 处理 sat.link 主题消息并更新左侧通信状态
 * @param {Object} data 包含通信链路指标的 JSON 数据
 */
function updateLinkStatus(data) {
    try {
        // 尝试获取包含链路数据的数组 
        // (考虑到C++可能将其命名为 links, link_list, 或直接发送数组)
        let linkArray = data.links || data.link_list || data.data;
        if (!linkArray && Array.isArray(data)) {
            linkArray = data; // 如果顶层直接是个数组
        }
        
        if (!linkArray || linkArray.length === 0) return;

        const ul = document.getElementById('link-list-ul');
        if (!ul) return;

        ul.innerHTML = ''; // 清空旧数据

        // 遍历渲染每颗卫星的通信指标
        linkArray.forEach(link => {
            // 兼容可能存在的不同字段命名
            const satId = link.id !== undefined ? link.id : link.sat_id;
            const dataRate = link.fssDataRate !== undefined ? link.fssDataRate.toFixed(2) : "0.00";
            const power = link.radioOuput !== undefined ? link.radioOuput.toFixed(2) : "0.00"; // 注意原文档拼写为 radioOuput

            const li = document.createElement('li');
            li.innerHTML = `
                <span style="color: #ffd700; width: 45px;">星 ${satId}</span>
                <span>速率: <span class="link-val">${dataRate}</span> Mbps</span>
                <span>功率: <span class="link-val">${power}</span> W</span>
            `;
            ul.appendChild(li);
        });
    } catch (err) {
        console.error("❌ [通信链路渲染错误]:", err);
    }
}


/**
 * 根据初始配置渲染静态轨道根数表
 */
function renderInitialOrbitTables(config) {
    // 渲染我方
    const friendUl = document.getElementById('friend-orbit-ul');
    if (friendUl && config.friends) {
        friendUl.innerHTML = ''; // 清空
        config.friends.forEach(sat => {
            friendUl.appendChild(createStaticOrbitLi(sat, 'friends'));
        });
    }

    // 渲染敌方
    const enemyUl = document.getElementById('enemy-orbit-ul');
    if (enemyUl && config.enemies) {
        enemyUl.innerHTML = ''; // 清空
        config.enemies.forEach(sat => {
            enemyUl.appendChild(createStaticOrbitLi(sat, 'enemies'));
        });
    }
}

/**
 * 创建静态轨道数据的列表项 (辅助函数)
 */
function createStaticOrbitLi(sat, type) {
    const li = document.createElement('li');
    // 根据文档字段：a_km, e, i_deg, raan_deg, argp_deg, ta_deg
    li.innerHTML = `
        <div style="color: ${type === 'friends' ? '#ffff00' : '#ff4c4c'}; font-weight: bold; font-size: 13px;">
            ${type === 'friends' ? '我方' : '敌方'}星 ${sat.id}
        </div>
        <div class="orbit-grid">
            <div class="orbit-item">a: <span class="orbit-val">${sat.a_km.toFixed(1)}</span><span style="font-size:9px">km</span></div>
            <div class="orbit-item">e: <span class="orbit-val">${sat.e.toFixed(4)}</span></div>
            <div class="orbit-item">i: <span class="orbit-val">${sat.i_deg.toFixed(2)}°</span></div>
            <div class="orbit-item">Ω: <span class="orbit-val">${sat.raan_deg.toFixed(2)}°</span></div>
            <div class="orbit-item">ω: <span class="orbit-val">${sat.argp_deg.toFixed(2)}°</span></div>
            <div class="orbit-item">θ: <span class="orbit-val">${sat.ta_deg.toFixed(2)}°</span></div>
        </div>
    `;
    return li;
}


/**
 * 🚀 更新：处理 sat.capture 捕获事件消息 (加入时间延迟排队逻辑)
 * @param {Object} data 捕获事件 JSON 数据
 */
function handleCaptureEvent(data) {
    // 1. 严格限定仅在场景 4、5、6 下触发
    const allowedScenes = [4, 5, 6];
    if (!allowedScenes.includes(data.scene_id)) return;

    // 2. 提取并校验 captured_target_ids 数组以及触发时刻 t
    const targetIds = data.captured_target_ids;
    const strikeTime = data.t; // 提取后端规定的精准打击时刻

    if (targetIds && Array.isArray(targetIds) && targetIds.length > 0 && strikeTime !== undefined) {
        console.log(`[事件捕获入队] 场景 ${data.scene_id} 收到捕获预告，目标星号:`, targetIds, `，计划执行时刻: ${strikeTime}s`);
        
        // 3. 将任务推入待打击队列，而不是直接执行
        if (typeof registerEventStrikeAction === 'function') {
            registerEventStrikeAction(strikeTime, targetIds);
        }
    }
}


// kafkaDataParser.js - 完全适配你的C++ sat.state 格式，无任何兼容问题
const KafkaDataParser = {
  // 核心方法：解析Kafka原始JSON字符串 + 处理所有卫星 + 调用updateSatellite渲染
  parseKafkaMessage: function (rawData) {
    if (!rawData || rawData === '') 
        return false;

    // 1. 解析原始JSON字符串（C++生产的原生格式）
    const kafkaJson = JSON.parse(rawData);
    if (!kafkaJson || !kafkaJson.states) 
        return false;

    // 新增：在这里刷新最后一次成功收到 sat.state 数据的现实时间
    window.lastSatStateRealTime = Date.now();

    const { friends, enemies } = kafkaJson.states;
    if (!friends && !enemies) 
        return false;

    // 更新仿真时刻
    // simulationTime.textContent = kafkaJson.t;
    // const scene_id = kafkaJson.scene_id;

    // const simTimeDom = document.getElementById('simulation-time');
    // if (simTimeDom) {
    //     simTimeDom.textContent = kafkaJson.t;
    // }

    // 强制将带有小数的仿真时刻向下取整：
    const simTimeDom = document.getElementById('simulation-time');
    if (simTimeDom) {
      window.currentSimTime = Number(kafkaJson.t); // 记录全局仿真时间供 Cesium 读取
      simTimeDom.textContent = Math.floor(Number(kafkaJson.t));
    }
    const scene_id = kafkaJson.scene_id;

    if (scene_id !== undefined) {
        window.currentSceneId = Number(scene_id); // 强制转为数字，防止字符串导致判断失败

        // 新增双保险：高频帧中如果发现了场景ID，也确保UI被正确隐藏
        if (typeof updateChartsVisibility === 'function') {
            updateChartsVisibility(window.currentSceneId);
        }
    }

    // ================= 调用状态更新机 =================
    if (typeof updatePhaseStatus === 'function') {
        updatePhaseStatus(kafkaJson, window.currentSceneId);
    }
    // =========================================================


    // 2. 处理【友方卫星】 friends = [{id:1, r_km:[], v_kmps:[], is_mother:bool},...]
    if (Array.isArray(friends) && friends.length > 0) {
      friends.forEach((sat, index) => {
        this.handleSingleSatellite(sat, 'friends', index,scene_id);
      });
    }

    // 3. 处理【敌方卫星】 enemies = [{id:101, r_km:[], v_kmps:[], is_mother:bool},...]
    if (Array.isArray(enemies) && enemies.length > 0) {
      enemies.forEach((sat, index) => {
        this.handleSingleSatellite(sat, 'enemies', index,scene_id);
      });
    }
    return true;
  },

  // 处理单颗卫星：格式化数据 → 单位转换 → 调用sat_orbit.js的updateSatellite
  handleSingleSatellite: function (sat, satType, index , scene_id) {
    try{
      // 校验C++返回的核心字段：必须有id + r_km + v_kmps
      if (!sat || !sat.id || !sat.r_km || !sat.v_kmps || sat.r_km.length!==3 || sat.v_kmps.length!==3) {
        console.warn(`[数据过滤] ${satType} 卫星数据不完整，跳过`);
        return;
      }

      // ✅ 适配你的C++数据格式的核心处理逻辑
      // 单位转换：C++里是 km/km/s → Cesium里需要 m/m/s (×1000)
      const posM = [sat.r_km[0]*1000, sat.r_km[1]*1000, sat.r_km[2]*1000]; // 位置 km → m
      const velM = [sat.v_kmps[0]*1000, sat.v_kmps[1]*1000, sat.v_kmps[2]*1000]; // 速度 km/s → m/s

      // // 计算轨道六要素 (调用你的orbit_function.js里的 rvToElements 方法)
      // const orbitElements = rvToElements(posM, velM);
      // const [a, e, i, Omega, w, Theta] = orbitElements;
      const a=0, e=0, i=0, Omega=0, w=0, Theta=0;

      // ✅ 构造 updateSatellite 要求的完整入参结构 (完全匹配你的sat_orbit.js)
      const satData = {
        id_number: sat.id,                  // 卫星ID 
        scene_id: scene_id,
        x: posM[0], 
        y: posM[1], 
        z: posM[2], // 位置 米
        vx: velM[0],  
        vy: velM[1], 
        vz: velM[2],  
        a: a,      // 半长轴 米
        e: e,      // 离心率
        i: i,      // 轨道倾角 rad             
        W: Omega,  // 升交点赤经 rad
        w: w,      // 近地点辐角 rad
        Theta: Theta, // 真近点角 rad
        EnemyType: satType === 'friends' ? 0 : 1, // 0=友方 1=敌方
        is_mother: sat.is_mother   // 母星标识
      };

      // console.log(`[探针1-解析层] 准备发送给Cesium: ID=${satData.id_number}, 阵营=${satType}, 
      //   坐标[X:${satData.x.toFixed(2)}, Y:${satData.y.toFixed(2)}, Z:${satData.z.toFixed(2)}]`);

      // ✅ 最终调用 sat_orbit.js 的核心渲染方法
      if (typeof updateSatellite === 'function') {
        updateSatellite(satData);
      }
    }catch(error){
      console.error(`❌ [解析层崩溃] 处理 ${satType} 第 ${index} 颗卫星时失败！`);
      console.error("错误信息:", error.message);
      console.error("错误堆栈:", error.stack);
      console.error("原始卫星数据:", sat);
    }
  }
};


/**
 * 🚀 新增：根据场景 ID 动态控制左侧图表面板的显示与隐藏
 * @param {Number} sceneId 场景号
 */
function updateChartsVisibility(sceneId) {
    if (!sceneId) return;
    const sid = Number(sceneId);

    // 获取各个图表的父级包裹框 (.panel-box)
    const friendBox = document.getElementById('friend-scatter-chart')?.closest('.panel-box');
    const enemyBox = document.getElementById('target-scatter-chart')?.closest('.panel-box');
    const distBox = document.getElementById('dist-time-chart')?.closest('.panel-box');

    // 1）3号场景不显示我方星群散点图
    if (friendBox) {
        friendBox.style.display = (sid === 3) ? 'none' : 'block';
    }

    // 2）1、2、3号场景不显示敌方星群散点图
    if (enemyBox) {
        enemyBox.style.display = ([1, 2, 3].includes(sid)) ? 'none' : 'block';
    }

    // 3）1、2、5号场景不显示相对距离时序图
    if (distBox) {
        distBox.style.display = ([1, 2, 5].includes(sid)) ? 'none' : 'block';
    }
}


/**
 * 新增：处理 sat.perception 态势感知数据，更新跟踪误差面板
 * @param {Object} perceptionData 感知主题的 JSON 数据
 */
function updatePerceptionErrors(perceptionData) {
    try {
        if (!perceptionData || !perceptionData.tracks) return;

        const ul = document.getElementById('perception-error-ul');
        if (!ul) return;

        // 如果没有跟踪到任何目标
        if (perceptionData.tracks.length === 0) {
            ul.innerHTML = '<li class="empty-tip">当前无稳定跟踪目标</li>';
            return;
        }

        // 清空旧列表
        ul.innerHTML = '';

        // 遍历所有的跟踪目标 (tracks)
        perceptionData.tracks.forEach(track => {
            // 提取关键字段并做缺省保护
            const truthName = track.associated_truth_name || "未知目标";
            const recogName = track.recognized_name || "未知代号";
            
            let errPos = "-";
            let errVel = "-";
            if (track.error && track.error.valid) {
                errPos = track.error.total_pos_err_km !== undefined ? track.error.total_pos_err_km.toFixed(3) : "-";
                errVel = track.error.total_vel_err_kmps !== undefined ? track.error.total_vel_err_kmps.toFixed(4) : "-";
            }

            // 创建并插入列表项
            const li = document.createElement('li');
            li.innerHTML = `
                <div style="color: #ff8c00; font-weight: bold; font-size: 13px; margin-bottom: 5px;">
                    真实ID: ${truthName} <span style="color:#aaa; font-size:11px; font-weight:normal;">(系统编号: ${recogName})</span>
                </div>
                <div style="display: flex; justify-content: space-between; color: #ccc; font-size: 12px; font-family: 'Courier New', monospace;">
                    <span>位置误差: <span style="color: #ff4c4c; font-weight:bold;">${errPos}</span> km</span>
                    <span>速度误差: <span style="color: #ff4c4c; font-weight:bold;">${errVel}</span> km/s</span>
                </div>
            `;
            ul.appendChild(li);
        });

    } catch (err) {
        console.error(" [感知误差面板更新失败]:", err);
    }
}

/**
 * 处理仿真阶段状态机
 * @param {Object} data sat.state 的 JSON 数据
 * @param {Number} sceneId 当前场景ID
 */
function updatePhaseStatus(data, sceneId) {
    const textDom = document.getElementById('current-phase-text');
    if (!textDom) return;

    const sid = Number(sceneId);

    // 1. 对于场景3，固定为“任务规划执行阶段”
    if (sid === 3) {
        textDom.textContent = "任务规划执行阶段";
        return;
    }

    // 初始化显示文本，如果没有数据则显示重构阶段（作为1,2,4,5,6的默认起步）
    let displayText = textDom.textContent === "等待状态数据..." ? "重构阶段" : textDom.textContent;

    // 2. 针对场景 1, 2, 4, 5, 6 的复杂状态机
    const allowedScenes = [1, 2, 4, 5, 6];
    if (allowedScenes.includes(sid)) {
        // 安全提取数据中的标志位
        const reconfig = data.reconfig_done;
        const manage = data.managestart;
        const game = data.gamestart;

        // 根据后期的状态优先级从高到低覆盖判定 (game > manage > reconfig)
        // 这样可以免疫高频数据波动，一旦进入后期阶段就不会轻易回退
        
        if ([4, 5, 6].includes(sid) && game === 1) {
            // 只有 4,5,6 才有博弈阶段
            displayText = "博弈阶段";
        } 
        else if (manage === 1) {
            // managestart 触发
            displayText = (sid === 6) ? "转移阶段" : "任务规划执行阶段";
        } 
        else if (reconfig === 1) {
            // reconfig_done 触发
            displayText = "保持阶段";
        } 
        else if (reconfig === 0) {
            // 初始重构阶段
            displayText = "重构阶段";
        }
    }

    // 更新UI，当文字发生改变时更新
    if (textDom.textContent !== displayText) {
        textDom.textContent = displayText;
        
        // 给状态文字加一点动态切换时的闪烁特效提示
        // textDom.style.opacity = 0;
        // setTimeout(() => { textDom.style.opacity = 1; }, 200);
    }
}