// 目标卫星模型的路径
const sat_example_path = '../public/assets/models/sat_2MB.glb' 
const starlink_path = '../public/assets/models/starlink/starlink_spacex_satellite.glb'
const starlink3_path = '../public/assets/models/StarLink-3/StarLink_3.glb'
const LDPE1_path = '../public/assets/models/LDPE -1/LDPE -1.glb'
const starshield_path = '../public/assets/models/StarShield/Starshield_.glb'
const tetra5_path = '../public/assets/models/Tetra-5/tatra-5.glb'


// 全局任务结束判定变量
window.totalDestroyedTargets = 0; // 成功摧毁总数
window.isMissionEnded = false;    // 任务是否已结束标记
window.lastSatStateRealTime = Date.now(); // 记录最后收到数据的现实时间
window.destroyedStatsByFriend = new Map(); // 记录每颗我方卫星的击毁数量


// 更新或创建卫星
function updateSatellite(sat_data) {
    try{    // 解析卫星数字ID
        const sat_idnumber = sat_data.id_number; // ID是数字类型 不是字符串
        // 解析卫星类型
        const isFriend = sat_data.EnemyType === 0; // 我方卫星
        //const isEnemy = sat_data.EnemyType === 1;  // 目标卫星
        const isMother = sat_data.is_mother == 1; // 是否为母星



        let sat_Record_friend, sat_Record_enemey;
        if(isFriend){
            sat_Record_friend = satellites_friend.get(sat_idnumber);
        }else{
            sat_Record_enemey = satellites_enemey.get(sat_idnumber)
        }

        // 轨道颜色与质点颜色 敌我区分逻辑
        let SatPointColor;
        if (isFriend) {
            SatPointColor = colorMap['黄色'];
        } else {
            SatPointColor = colorMap['红色'];
        } 

        // 如果卫星不存在，创建它
        if (!sat_Record_friend&&!sat_Record_enemey) {
            let model_path
            // 按照卫星类型选择模型
            if(isFriend){
                model_path = sat_example_path
            }else{
                model_path = starlink_path
            }

            // 创建固定位置属性，后续会更新
            const position = Cesium.Cartesian3.fromElements(sat_data.x, sat_data.y, sat_data.z);
            // 主窗口卫星实体创建
            let satelliteEntity = mainViewer.entities.add({
                name: "卫星-" + sat_idnumber,
                position: position,
                point: { // 质心点
                    pixelSize: 8,
                    color: SatPointColor,                                                                
                    //show:showSatPoints,
                },
                model: {
                    uri: model_path, // 导入卫星模型 路径要是两点不然导入有问题
                    scale: 100, // 缩放尺寸
                    minimumPixelSize: 20, // 最大像素
                    //show: showSatModels,
                },

                label: { // 卫星编号标签
                    text: sat_idnumber.toString(),
                    font: '14px Arial',
                    fillColor: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -20),
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    //show: showSatNumbers // 根据全局变量控制显示/隐藏
                }
            });
            // 副窗口卫星实体创建(之创建我方卫星)
            let subSatEntity;
            if(isFriend){
                let text_name;
                if(isMother){
                    text_name = sat_idnumber.toString()+"(母星)";
                }else{
                    // console.log(sat_data.id_number);
                    // console.log(sat_data.scene_id);
                    if(sat_data.scene_id == 5 && (sat_data.id_number == 2||sat_data.id_number == 3)){ // 我方子母式星群场景，2号星与3号星为侦察星
                        text_name = sat_idnumber.toString()+"(侦察星)";
                    }else{
                        text_name = sat_idnumber.toString()+"(子星)";
                    }
                    
                }
                subSatEntity = subViewer.entities.add({
                    name: "卫星-" + sat_idnumber,
                    position: position,
                    point: { // 质心点
                        pixelSize: 8,
                        color: SatPointColor,                                                                
                        //show:showSatPoints,
                    },
                    model: {
                        uri: model_path, // 导入卫星模型 路径要是两点不然导入有问题
                        scale: 100, // 缩放尺寸
                        minimumPixelSize: 20, // 最大像素
                        //show: showSatModels,
                    },

                    label: { // 卫星编号标签
                        text: text_name,
                        font: '14px Arial',
                        fillColor: Cesium.Color.WHITE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                        pixelOffset: new Cesium.Cartesian2(0, -20),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                        //show: showSatNumbers // 根据全局变量控制显示/隐藏
                    }
                });
            }

            


            // 存储主、副窗口的卫星实体
            if(isFriend){ // 我方卫星实体有主窗口与副窗口
                satellites_friend.set(sat_idnumber, {
                    data: {sat_data, isFriend, isMother},
                    entity: [satelliteEntity, subSatEntity]
                });

                sat_Record_friend = satellites_friend.get(sat_idnumber);
            }else{ // 目标卫星实体只有主窗口
                satellites_enemey.set(sat_idnumber, {
                    data: {sat_data, isFriend, isMother},
                    entity: [satelliteEntity]
                });

                sat_Record_enemey = satellites_enemey.get(sat_idnumber);
            }

        } 
        //else if(sat_data.EnemyType == 2 && !showAllEnemy){} // 如果状态为不显示敌方星群，直接跳过相关卫星的更新
        else { 
            if(sat_Record_friend){
                // 更新存储的数据
                satellites_friend.get(sat_idnumber).data.sat_data = sat_data;

                // 引用类型，直接影响原entity
                let satelliteEntity = sat_Record_friend.entity[0]; 
                let subSatEntity = sat_Record_friend.entity[1];
                
                // 更新卫星位置
                satelliteEntity.position.setValue(Cesium.Cartesian3.fromElements(sat_data.x, sat_data.y, sat_data.z));
                subSatEntity.position.setValue(Cesium.Cartesian3.fromElements(sat_data.x, sat_data.y, sat_data.z));
            }
            else if(sat_Record_enemey){
                // 更新存储的数据
                satellites_enemey.get(sat_idnumber).data.sat_data = sat_data;

                // 引用类型，直接影响原entity
                let satelliteEntity = sat_Record_enemey.entity[0]; 

                // 更新卫星位置
                satelliteEntity.position.setValue(Cesium.Cartesian3.fromElements(sat_data.x, sat_data.y, sat_data.z));
            }
        }
    }catch(error){
        console.error("❌ [渲染层崩溃] updateSatellite 函数执行失败！");
        console.error("具体的错误信息 (Error Message):", error.message);
        console.error("错误发生的位置 (Stack Trace):", error.stack);
        console.error("导致崩溃的传入数据:", sat_data);
    }
}


// ==========================================
// 任务列表与 3D 场景联动控制逻辑
// ==========================================

let currentHighlightedMission = null; // 记录当前选中的任务
let missionLineEntity = null; // 记录当前高亮的连线实体
/**
 * 切换任务涉及卫星的高亮状态
 * @param {Number} friendId 我方卫星ID
 * @param {Number} enemyId 敌方卫星ID
 * @param {HTMLElement} listItemElement 被点击的列表DOM元素
 */
function toggleHighlightMission(friendId, enemyId, listItemElement) {
    // 1. 如果之前有高亮的任务，先将其全部恢复原状
    if (currentHighlightedMission) {
        restoreEntityStyle(currentHighlightedMission.friendId, true);
        restoreEntityStyle(currentHighlightedMission.enemyId, false);
        // 移除旧列表项的CSS高亮类
        if (currentHighlightedMission.domElement) {
            currentHighlightedMission.domElement.classList.remove('active-mission');
        }
        // 移除场景中的高亮连线
        if (missionLineEntity) {
            mainViewer.entities.remove(missionLineEntity);
            missionLineEntity = null;
        }
    }

    // 2. 判断是否是“再次点击取消选中” (Toggle Off)
    if (currentHighlightedMission && 
        currentHighlightedMission.friendId === friendId && 
        currentHighlightedMission.enemyId === enemyId) {
        currentHighlightedMission = null; // 清空记录
        return; // 结束执行，保持恢复后的原状
    }

    // 3. 执行新的高亮 (Toggle On)
    highlightEntityStyle(friendId, true);
    highlightEntityStyle(enemyId, false);

    // 为当前点击的列表项添加CSS高亮类
    if (listItemElement) {
        listItemElement.classList.add('active-mission');
    }

    // 4. 绘制我方执行星与目标星之间的动态连线
    drawMissionLine(friendId, enemyId);

    // 更新当前高亮记录
    currentHighlightedMission = { friendId, enemyId, domElement: listItemElement };
}

// 辅助函数：绘制任务动态连线
function drawMissionLine(friendId, enemyId) {
    const friendRecord = satellites_friend.get(friendId);
    const enemyRecord = satellites_enemey.get(enemyId);

    if (!friendRecord || !enemyRecord) return;

    const friendEntity = friendRecord.entity[0]; // 获取主窗口的我方实体
    const enemyEntity = enemyRecord.entity[0];   // 获取主窗口的敌方实体

    if (!friendEntity || !enemyEntity) return;

    // 使用 CallbackProperty 实现坐标的动态跟随，连线会跟着卫星实时移动
    missionLineEntity = mainViewer.entities.add({
        name: 'Mission-Target-Line',
        polyline: {
            positions: new Cesium.CallbackProperty(function(time, result) {
                const pos1 = friendEntity.position.getValue(time);
                const pos2 = enemyEntity.position.getValue(time);
                // 只有当两个点的位置都存在时才绘制线条
                if (pos1 && pos2) {
                    return [pos1, pos2];
                }
                return [];
            }, false),
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.3,
                taperPower: 1.0,
                color: Cesium.Color.CYAN // 醒目的青色发光线条
            })
        }
    });
}

// 辅助函数：将实体设为醒目的高亮样式 (白色大字+青色外发光点)
function highlightEntityStyle(satId, isFriend) {
    const map = isFriend ? satellites_friend : satellites_enemey;
    const record = map.get(satId);
    if (!record) return;

    record.entity.forEach(ent => {
        if (!ent) return;
        // 放大点并改为青色
        if (ent.point) {
            ent.point.color = Cesium.Color.WHITE;
            ent.point.pixelSize = 12;
            ent.point.outlineColor = Cesium.Color.CYAN;
            ent.point.outlineWidth = 3;
        }
        // 放大标签并加上背景底色
        if (ent.label) {
            ent.label.fillColor = Cesium.Color.WHITE;
            ent.label.scale = 1.0;
            ent.label.showBackground = true;
            ent.label.backgroundColor = new Cesium.Color(0.0, 0.5, 0.8, 0.8);
        }
    });
}

// 辅助函数：恢复实体原本的样式 (我方黄，敌方红)
function restoreEntityStyle(satId, isFriend) {
    const map = isFriend ? satellites_friend : satellites_enemey;
    const record = map.get(satId);
    if (!record) return;

    record.entity.forEach(ent => {
        if (!ent) return;
        // 恢复原始点大小和颜色
        if (ent.point) {
            ent.point.color = isFriend ? Cesium.Color.YELLOW : Cesium.Color.RED;
            ent.point.pixelSize = 5; 
            ent.point.outlineWidth = 0;
        }
        // 恢复原始标签样式
        if (ent.label) {
            //ent.label.fillColor = isFriend ? Cesium.Color.YELLOW : Cesium.Color.RED;
            ent.label.fillColor = Cesium.Color.WHITE
            ent.label.outlineColor = Cesium.Color.BLACK
            ent.label.scale = 0.8;
            ent.label.showBackground = false;
        }
    });
}


// ==========================================
// 动态打击与摧毁判定系统（全场景双轨制架构）
// ==========================================

// 新增：用于存储场景 4, 5, 6 的待执行打击事件队列
window.PendingEventStrikes = []; 

/**
 * 注册排队：将收到的事件记录进时间轴待办
 */
function registerEventStrikeAction(strikeTime, targetIds) {
    window.PendingEventStrikes.push({
        strikeTime: strikeTime,
        targetIds: targetIds
    });
}

// 等待页面底部的 mainViewer 创建完毕后，再挂载底层渲染监听
window.addEventListener('load', () => {
    if (typeof mainViewer !== 'undefined') {
        mainViewer.scene.preUpdate.addEventListener(function(scene, time) {
            if (typeof window.currentSimTime === 'undefined') return;

            // ==============================================================
            // 逻辑分支 A：场景 1, 2, 3 (基于 50km 欧氏距离的前端自主开火)
            // ==============================================================
            if (window.currentSceneId && window.currentSceneId < 4 && window.MissionRegistry) {
                window.MissionRegistry.forEach((mission, key) => {
                    if (mission.status === 'pending' && window.currentSimTime >= mission.start_time) {
                        const friendRecord = satellites_friend.get(mission.friend_id);
                        const enemyRecord = satellites_enemey.get(mission.target_id);

                        if (friendRecord && enemyRecord) {
                            const friendEnt = friendRecord.entity[0];
                            const enemyEnt = enemyRecord.entity[0];
                            
                            if (friendEnt.show !== false && enemyEnt.show !== false && !enemyEnt._isBeingStruck) {
                                const posF = friendEnt.position.getValue(time);
                                const posE = enemyEnt.position.getValue(time);

                                if (posF && posE) {
                                    const distMeters = Cesium.Cartesian3.distance(posF, posE);
                                    if (distMeters <= 55000) {  // 应当适当放宽
                                        triggerStrikeAction(mission, enemyRecord);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // ==============================================================
            // 逻辑分支 B：场景 4, 5, 6 (基于 C++ 规定的打击时刻 t 延迟开火)
            // ==============================================================
            if (window.currentSceneId && window.currentSceneId >= 4 && window.PendingEventStrikes) {
                // 倒序遍历数组，方便在触发后安全地使用 splice 移除元素
                for (let i = window.PendingEventStrikes.length - 1; i >= 0; i--) {
                    let strikeTask = window.PendingEventStrikes[i];
                    
                    // 🚀 核心时间锁：只有当全局仿真时间走到或越过了计划的 strikeTime 时，才真正点火！
                    if (window.currentSimTime >= strikeTask.strikeTime) {
                        triggerEventStrikeAction(strikeTask.targetIds);
                        // 触发完毕，将该任务从待办队列中剔除
                        window.PendingEventStrikes.splice(i, 1);
                    }
                }
            }
        });


    } else {
        console.error("未能找到 mainViewer，打击判定系统初始化失败！");
    }
});

/**
 * 触发打击动作
 */
function triggerStrikeAction(mission, enemyRecord) {
    console.log(`[场景1、2、3专属打击触发] 我方 ${mission.friend_id} 已抵近 敌方 ${mission.target_id}，开始打击！`);
    
    mission.status = 'striking'; // 更新状态机

    // 标记一次打击正在发生，刷新活跃时间
    window.activeStrikesCount++;
    window.lastActivityRealTime = Date.now();

    if (mission.liElement) mission.liElement.classList.add('mission-striking');

    const enemyEnt = enemyRecord.entity[0];

    // 1. 敌方卫星变为橙色高亮圆，表示正在遭受打击
    if (enemyEnt.point) {
        enemyEnt.point.color = Cesium.Color.ORANGE;
        enemyEnt.point.pixelSize = 25; 
        enemyEnt.point.outlineColor = Cesium.Color.RED;
        enemyEnt.point.outlineWidth = 5;
    }
    if (enemyEnt.label) {
        enemyEnt.label.text = "💥 遭受打击";
        enemyEnt.label.fillColor = Cesium.Color.ORANGE;
    }

    // 2. 现实世界 5 秒后，彻底摧毁该目标
    setTimeout(() => {

        // 新增：打击完成，更新摧毁总数，解除占用，重置计时器
        window.activeStrikesCount = Math.max(0, window.activeStrikesCount - 1);
        window.totalDestroyedTargets++;
        window.lastActivityRealTime = Date.now();


        // ================= 新增：计入我方单星战果 =================
        const fId = mission.friend_id;
        const currentScore = window.destroyedStatsByFriend.get(fId) || 0;
        window.destroyedStatsByFriend.set(fId, currentScore + 1);
        // ==========================================================

        mission.status = 'destroyed';
        
        // UI 更新：任务栏变灰并取消闪烁
        if (mission.liElement) {
            mission.liElement.classList.remove('active-mission', 'mission-striking');
            mission.liElement.classList.add('mission-completed');
        }

        // 如果用户当时正点击了这个任务的高亮，强制取消连线和高亮
        if (currentHighlightedMission && currentHighlightedMission.target_id === mission.target_id) {
            if (missionLineEntity) {
                mainViewer.entities.remove(missionLineEntity);
                missionLineEntity = null;
            }
            currentHighlightedMission = null;
        }

        // 核心：在 Cesium 场景中彻底隐藏目标卫星
        enemyRecord.entity.forEach(ent => {
            if(ent) ent.show = false; 
        });

        // 顶栏数据更新：敌方卫星总数 - 1
        const enemyCountDom = document.getElementById('header-enemy-count');
        if (enemyCountDom) {
            let currentCount = parseInt(enemyCountDom.textContent) || 0;
            if (currentCount > 0) {
                enemyCountDom.textContent = currentCount - 1;
            }
        }
        
        // 顶栏总数更新：satelliteCount
        const totalCountDom = document.getElementById('satelliteCount');
        if (totalCountDom) {
            let totalCount = parseInt(totalCountDom.textContent) || 0;
            if (totalCount > 0) totalCountDom.textContent = totalCount - 1;
        }

        // 【Echarts 散点图更新钩子】
        // 如果你的 analysis_charts.js 中有相关逻辑，可以挂载一个全局函数供这里调用
        if (typeof window.removeEnemyPointFromChart === 'function') {
            window.removeEnemyPointFromChart(mission.target_id);
        } else {
            console.log(`[提示] 目标 ${mission.target_id} 已被摧毁，如有 Echarts 散点图需同步移除该点。`);
        }

        console.log(`[摧毁完成] 敌方 ${mission.target_id} 已在场景中抹除。`);

    }, 5000); // 5000毫秒 = 5秒
}


/**
 * 新增：事件驱动的批量打击动作 (专用于场景4, 5, 6)
 * @param {Array} targetIds 被捕获的敌方卫星ID数组
 */
function triggerEventStrikeAction(targetIds) {
    targetIds.forEach(targetId => {
        const enemyRecord = satellites_enemey.get(targetId);
        if (!enemyRecord) return;

        const enemyEnt = enemyRecord.entity[0];
        // 避免重复打击（如果已经隐藏或正在打击，则跳过）
        if (!enemyEnt || enemyEnt.show === false || enemyEnt._isBeingStruck) return; 

        enemyEnt._isBeingStruck = true; // 打上正在打击的标记
        // 新增：标记一次打击正在发生
        window.activeStrikesCount++;
        window.lastActivityRealTime = Date.now();
        console.log(`[场景4、5、6 专属打击执行事件] 目标星 ${targetId} 正在遭受打击！`);

        // 1. 呈现受击特效（橙色高亮放大）
        if (enemyEnt.point) {
            enemyEnt.point.color = Cesium.Color.ORANGE;
            enemyEnt.point.pixelSize = 25; 
            enemyEnt.point.outlineColor = Cesium.Color.RED;
            enemyEnt.point.outlineWidth = 5;
        }
        if (enemyEnt.label) {
            enemyEnt.label.text = "💥 遭受打击";
            enemyEnt.label.fillColor = Cesium.Color.ORANGE;
        }

        // 2. 查找并更新相关的任务列表UI (变灰失效并闪烁)
        if (window.MissionRegistry) {
            window.MissionRegistry.forEach((mission, key) => {
                if (mission.target_id === targetId && mission.status !== 'destroyed') {
                    mission.status = 'striking';
                    if (mission.liElement) mission.liElement.classList.add('mission-striking');
                }
            });
        }

        // 3. 现实世界 5 秒后，抹除模型并更新计数
        setTimeout(() => {

            // 新增：打击完成
            window.activeStrikesCount = Math.max(0, window.activeStrikesCount - 1);
            window.totalDestroyedTargets++;
            window.lastActivityRealTime = Date.now();

            // ================= 溯源并计入我方单星战果 =================
            let fId = null;
            if (window.MissionRegistry) {
                // 从全局注册表反查这个目标是由谁负责的
                window.MissionRegistry.forEach((missionData) => {
                    if (missionData.target_id === targetId) fId = missionData.friend_id;
                });
            }
            if (fId !== null) {
                const currentScore = window.destroyedStatsByFriend.get(fId) || 0;
                window.destroyedStatsByFriend.set(fId, currentScore + 1);
            }
            // ==========================================================

            // A. 彻底隐藏目标实体
            enemyRecord.entity.forEach(ent => {
                if(ent) ent.show = false; 
            });

            // B. 任务列表彻底变灰
            if (window.MissionRegistry) {
                window.MissionRegistry.forEach((mission, key) => {
                    if (mission.target_id === targetId) {
                        mission.status = 'destroyed';
                        if (mission.liElement) {
                            mission.liElement.classList.remove('active-mission', 'mission-striking');
                            mission.liElement.classList.add('mission-completed');
                        }
                        
                        // 清理可能存在的选定连线和高亮
                        if (currentHighlightedMission && currentHighlightedMission.enemyId === targetId) {
                            restoreEntityStyle(currentHighlightedMission.friendId, true);
                            if (missionLineEntity) {
                                mainViewer.entities.remove(missionLineEntity);
                                missionLineEntity = null;
                            }
                            currentHighlightedMission = null;
                        }
                    }
                });
            }

            // C. 顶栏敌方卫星总数 - 1
            const enemyCountDom = document.getElementById('header-enemy-count');
            if (enemyCountDom) {
                let currentCount = parseInt(enemyCountDom.textContent) || 0;
                if (currentCount > 0) enemyCountDom.textContent = currentCount - 1;
            }
            
            // D. 顶栏全场景卫星总数 - 1
            const totalCountDom = document.getElementById('satelliteCount');
            if (totalCountDom) {
                let totalCount = parseInt(totalCountDom.textContent) || 0;
                if (totalCount > 0) totalCountDom.textContent = totalCount - 1;
            }

            // E. 从 Echarts 散点图中移除 (如有此挂载函数)
            if (typeof window.removeEnemyPointFromChart === 'function') {
                window.removeEnemyPointFromChart(targetId);
            }

            console.log(`[事件销毁完成] 目标星 ${targetId} 已彻底移除。`);
        }, 5000); 
    });
}


// ==========================================
// 🚀 任务终结侦测系统 (基于数据断流)
// ==========================================
window.addEventListener('load', () => {
    const closeBtn = document.getElementById('close-modal-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('mission-end-modal').style.display = 'none';
        });
    }

    // 后台每秒巡查一次
    setInterval(() => {
        // 如果已经结束，或者用户手动暂停了渲染，则跳过侦测
        if (window.isMissionEnded || (typeof RenderManager !== 'undefined' && RenderManager.isPaused)) {
            return;
        }
        
        // 条件1：仿真时刻超过 20000s
        if (window.currentSimTime && window.currentSimTime >= 20000) {
            
            // 取得最后一次接收到 sat.state 的时间
            const lastDataTime = window.lastSatStateRealTime || Date.now();
            
            // 🚀 条件2：现实世界连续 10s 没有收到新的 sat.state 数据 (C++进程跑完或断开)
            if (Date.now() - lastDataTime >= 10000) {
                triggerMissionEnd();
            }
        }
    }, 1000);
});


/**
 * 触发仿真结束的收尾动作
 */
function triggerMissionEnd() {
    window.isMissionEnded = true;
    console.log(`💥 [仿真结束] 超过20000s且连续10s无动作，任务终止。共摧毁 ${window.totalDestroyedTargets} 目标。`);

    // 1. 停止本地的 Cesium 渲染与时间流动
    if (typeof mainViewer !== 'undefined') {
        mainViewer.clock.shouldAnimate = false;
    }

    // 2. 告诉后端服务停止发送数据（切断水管）
    if (typeof wsInstance !== 'undefined' && wsInstance && wsInstance.readyState === WebSocket.OPEN) {
        wsInstance.send(JSON.stringify({ cmd: 'pause' }));
    }
    
    // 3. 将 UI 的播放按钮置为暂停状态
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn && typeof RenderManager !== 'undefined') {
        RenderManager.isPaused = true;
        playPauseBtn.innerHTML = '▶';
        playPauseBtn.title = '开始渲染';
    }

    // 4. 更新弹窗内的摧毁数量并显示弹窗
    const countSpan = document.getElementById('final-destroyed-count');
    if (countSpan) {
        countSpan.textContent = window.totalDestroyedTargets;
    }


    // ================= 排序并渲染打击结果列表 =================
    const detailList = document.getElementById('stats-detail-list');
    if (detailList) {
        detailList.innerHTML = ''; // 清空旧数据
        
        // 将 Map 转换为数组，并根据我方卫星 ID (a[0]) 从小到大排序
        const sortedStats = Array.from(window.destroyedStatsByFriend.entries()).sort((a, b) => a[0] - b[0]);

        if (sortedStats.length === 0) {
            detailList.innerHTML = '<li style="text-align:center; color:#aaa; font-size:13px; padding:10px 0;">未产生有效打击记录</li>';
        } else {
            sortedStats.forEach(([friendId, killCount]) => {
                const li = document.createElement('li');
                li.style.cssText = "display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px dashed rgba(255,255,255,0.1); font-size: 14px;";
                li.innerHTML = `
                    <span>我方 <span style="color: #ffd700; font-weight: bold;">${friendId} 号星</span></span>
                    <span>摧毁 <span style="color: #ff4c4c; font-weight: bold; font-size: 16px; margin: 0 5px;">${killCount}</span> 目标</span>
                `;
                detailList.appendChild(li);
            });
        }
    }
    // ==========================================================


    const modal = document.getElementById('mission-end-modal');
    if (modal) {
        modal.style.display = 'flex'; // 显示居中弹窗
    }

    
}