// ================= 原生 3D 数学运算引擎 (必须放在文件最顶部) =================
const Math3D = {
    sub: (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]],
    dot: (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2],
    cross: (a, b) => [
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    ],
    normalize: (a) => {
        let len = Math.hypot(a[0], a[1], a[2]);
        return len === 0 ? [0,0,0] : [a[0]/len, a[1]/len, a[2]/len];
    },
    length: (a) => Math.hypot(a[0], a[1], a[2])
};

document.addEventListener('DOMContentLoaded', () => {

    //1. 启动所有图表
    initFriendScatterChart();
    initTargetScatterChart();
    initDistTimeChart();
    initTaskDistChart();

    // 🚀 2. 统一侧边栏手风琴收放逻辑
    document.querySelectorAll('.panel-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling; 
            const icon = header.querySelector('.panel-icon');
            const isExpanded = content.classList.contains('show');

            if (isExpanded) {
                content.classList.remove('show');
                if (icon) icon.textContent = '▼';
            } else {
                content.classList.add('show');
                if (icon) icon.textContent = '▲';
                
                // 展开时，延迟 300ms 等待下拉动画结束后强制图表重绘，彻底解决“文字挤压”问题
                setTimeout(() => {
                    const chartDom = content.querySelector('div[id$="-chart"]');
                    if (chartDom) {
                        const chart = echarts.getInstanceByDom(chartDom);
                        if (chart) chart.resize();
                    }
                }, 300); 
            }
        });
    });
});

function initFriendScatterChart() {
    const chartDom = document.getElementById('friend-scatter-chart');
    if (!chartDom) return;

    // 初始化 ECharts 实例
    const myChart = echarts.init(chartDom);

    // 1. 初始状态：显示加载动画与“等待数据中...”
    myChart.showLoading({
        text: '等待星群数据接入...',
        color: '#00dfff',
        textColor: '#fff',
        maskColor: 'rgba(20, 24, 35, 0.8)',
        zlevel: 0
    });

    // 定义基础空配置 (关闭了 autoRotate)
    const option = {
        tooltip: {
            appendToBody: true, // 让提示框突破容器限制，挂载到全局 body
            formatter: function (params) {
                return `${params.data.name}<br/>
                        R (径向): ${params.value[0]} km<br/>
                        V (切向): ${params.value[1]} km<br/>
                        H (法向): ${params.value[2]} km`;
            }
        },
        xAxis3D: { name: 'R-bar(km)', type: 'value', nameTextStyle: { color: '#00dfff' } },
        yAxis3D: { name: 'V-bar(km)', type: 'value', nameTextStyle: { color: '#00dfff' } },
        zAxis3D: { name: 'H-bar(km)', type: 'value', nameTextStyle: { color: '#00dfff' } },
        grid3D: {
            boxWidth: 60, boxDepth: 60, boxHeight: 60,
            viewControl: {
                autoRotate: false,      // ✅ 已关闭自转，减少渲染负担
                distance: 150           
            },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.5)' } },
            axisLabel: { textStyle: { color: '#fff', fontSize: 10 } }
        },
        series: [{
            type: 'scatter3D',
            symbolSize: 8,
            data: [] // 初始空数据
        }]
    };

    myChart.setOption(option);

    // ✅ 替换为现代容器尺寸监听器 (ResizeObserver)
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            myChart.resize();
        });
        resizeObserver.observe(chartDom);
    } else {
        window.addEventListener('resize', () => myChart.resize());
    }

    // ==========================================
    // 定时刷新逻辑：每 10 秒接入真实数据计算 LVLH
    // ==========================================
    setInterval(() => {
        // 性能优化：如果该面板被隐藏了，直接退出，不耗费算力
        const chartDom = document.getElementById('friend-scatter-chart');

        // 如果系统处于暂停状态，图表停止更新历史和重绘
        if (typeof RenderManager !== 'undefined' && RenderManager.isPaused) return;

        // 如果全局变量 satellites_friend 不存在或为空，继续等待
        if (typeof satellites_friend === 'undefined' || satellites_friend.size === 0) {
            return; 
        }

        let motherData = null;

        // 1. 遍历 Map，寻找母星数据
        for (let [id, record] of satellites_friend.entries()) {
            if (record.data.isMother) {
                motherData = record.data.sat_data;
                break;
            }
        }

        // 兜底逻辑：如果没有明确标记母星，默认取我方阵营的第一个节点作为原点
        if (!motherData) {
            motherData = Array.from(satellites_friend.values())[0].data.sat_data;
        }
        
        if (!motherData) return;

        // 取消“等待数据”UI
        myChart.hideLoading();

        // 2. 获取母星在惯性系下的位置与速度
        const Rm = [motherData.x, motherData.y, motherData.z];
        // 如果数据里没有传入速度，则给一个假定速度避免坐标轴计算崩溃
        const Vm = [motherData.vx || 0, motherData.vy || 1, motherData.vz || 0]; 

        // 3. 构建 LVLH 坐标系基向量 (直接使用全局的 vec3)
        let uR = vec3.create(); // 径向
        let H  = vec3.create(); // 角动量方向
        let uH = vec3.create(); // 法向
        let uV = vec3.create(); // 切向

        vec3.normalize(uR, Rm);
        vec3.cross(H, Rm, Vm);
        
        if (vec3.length(H) < 1e-6) {
            vec3.set(H, 0, 0, 1); // 防止奇异
        }
        
        vec3.normalize(uH, H);
        vec3.cross(uV, uH, uR); // uV = uH × uR

        // 4. 遍历所有节点生成散点数据
        const chartData = [];
        
        // 压入母星自身 (必定在原点)
        chartData.push({
            value: [0, 0, 0],
            itemStyle: { color: '#00dfff' },
            symbolSize: 12,
            name: `母星 (${motherData.id_number})`
        });

        // 计算其它子星在 LVLH 坐标系下的相对坐标
        for (let [id, record] of satellites_friend.entries()) {
            const sat = record.data.sat_data;
            if (sat.id_number === motherData.id_number) continue; // 跳过母星

            const Ri = [sat.x, sat.y, sat.z];
            const dR = vec3.create();
            vec3.subtract(dR, Ri, Rm); // ∆R = Ri - Rm

            // 将绝对位置差投影到 LVLH 三轴上，并从米转换为千米 (km)
            const x_lvlh = vec3.dot(dR, uR) / 1000;
            const y_lvlh = vec3.dot(dR, uV) / 1000;
            const z_lvlh = vec3.dot(dR, uH) / 1000;

            chartData.push({
                value: [x_lvlh.toFixed(2), y_lvlh.toFixed(2), z_lvlh.toFixed(2)],
                itemStyle: { color: '#ffff00' },
                symbolSize: 6,
                name: `子星 (${sat.id_number})`
            });
        }

        // 5. 刷新图表
        myChart.setOption({
            series: [{ data: chartData }]
        });
        
    }, 10000); // 10秒刷新一次
}

function initTargetScatterChart() {
    const chartDom = document.getElementById('target-scatter-chart');
    if (!chartDom) return;

    const myChart = echarts.init(chartDom);

    // 初始状态：显示红色的加载动画
    myChart.showLoading({
        text: '等待目标数据接入...',
        color: '#ff4c4c',
        textColor: '#fff',
        maskColor: 'rgba(20, 24, 35, 0.8)',
        zlevel: 0
    });

    const option = {
        tooltip: {
            appendToBody: true, // 让提示框突破容器限制，挂载到全局 body
            formatter: function (params) {
                return `${params.data.name}<br/>
                        R (径向): ${params.value[0]} km<br/>
                        V (切向): ${params.value[1]} km<br/>
                        H (法向): ${params.value[2]} km`;
            }
        },
        // 目标星系的坐标文字采用偏红色调
        xAxis3D: { name: 'R-bar(km)', type: 'value', nameTextStyle: { color: '#ff4c4c' } },
        yAxis3D: { name: 'V-bar(km)', type: 'value', nameTextStyle: { color: '#ff4c4c' } },
        zAxis3D: { name: 'H-bar(km)', type: 'value', nameTextStyle: { color: '#ff4c4c' } },
        grid3D: {
            boxWidth: 60, boxDepth: 60, boxHeight: 60,
            viewControl: {
                autoRotate: false,      // 关闭自转，节省性能
                distance: 150           
            },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.5)' } },
            axisLabel: { textStyle: { color: '#fff', fontSize: 10 } }
        },
        series: [{
            type: 'scatter3D',
            symbolSize: 8,
            data: [] 
        }]
    };

    myChart.setOption(option);

    // ✅ 替换为现代容器尺寸监听器 (ResizeObserver)
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            myChart.resize();
        });
        resizeObserver.observe(chartDom);
    } else {
        window.addEventListener('resize', () => myChart.resize());
    }

    // ==========================================
    // 定时刷新逻辑：解析敌方星群数据 (satellites_enemey)
    // ==========================================
    setInterval(() => {
        // 性能优化：如果该面板被隐藏了，直接退出，不耗费算力
        const chartDom = document.getElementById('target-scatter-chart');

        // 如果系统处于暂停状态，图表停止更新历史和重绘
        if (typeof RenderManager !== 'undefined' && RenderManager.isPaused) return;

        // 如果全局变量 satellites_enemey 不存在或为空，继续等待
        if (typeof satellites_enemey === 'undefined' || satellites_enemey.size === 0) {
            return; 
        }

        let targetCenterData = null;

        // 1. 寻找目标星群的母星或核心节点
        for (let [id, record] of satellites_enemey.entries()) {
            if (record.data.isMother) {
                targetCenterData = record.data.sat_data;
                break;
            }
        }

        // 兜底逻辑：如果敌方没有标记母星，默认取第一个目标作为坐标原点
        if (!targetCenterData) {
            targetCenterData = Array.from(satellites_enemey.values())[0].data.sat_data;
        }
        
        if (!targetCenterData) return;

        myChart.hideLoading();

        // 2. 获取目标中心点在惯性系下的位置与速度
        const Rm = [targetCenterData.x, targetCenterData.y, targetCenterData.z];
        const Vm = [targetCenterData.vx || 0, targetCenterData.vy || 1, targetCenterData.vz || 0]; 

        // 3. 构建 LVLH 坐标系基向量 (使用全局的 vec3)
        let uR = vec3.create(); 
        let H  = vec3.create(); 
        let uH = vec3.create(); 
        let uV = vec3.create(); 

        vec3.normalize(uR, Rm);
        vec3.cross(H, Rm, Vm);
        
        if (vec3.length(H) < 1e-6) {
            vec3.set(H, 0, 0, 1); 
        }
        
        vec3.normalize(uH, H);
        vec3.cross(uV, uH, uR); 

        // 4. 遍历敌方节点生成散点数据
        const chartData = [];
        
        // 压入目标中心 (必定在原点，用醒目的橙红色标识)
        chartData.push({
            value: [0, 0, 0],
            itemStyle: { color: '#ff8c00' }, 
            symbolSize: 12,
            name: `目标中心 (${targetCenterData.id_number})`
        });

        // 计算其它目标星在 LVLH 坐标系下的相对坐标
        for (let [id, record] of satellites_enemey.entries()) {
            const sat = record.data.sat_data;
            if (sat.id_number === targetCenterData.id_number) continue;

            const Ri = [sat.x, sat.y, sat.z];
            const dR = vec3.create();
            vec3.subtract(dR, Ri, Rm); 

            // 将绝对位置差投影到 LVLH 三轴上，并从米转换为千米 (km)
            const x_lvlh = vec3.dot(dR, uR) / 1000;
            const y_lvlh = vec3.dot(dR, uV) / 1000;
            const z_lvlh = vec3.dot(dR, uH) / 1000;

            chartData.push({
                value: [x_lvlh.toFixed(2), y_lvlh.toFixed(2), z_lvlh.toFixed(2)],
                itemStyle: { color: '#ff0000' }, // 红色表示敌方普通子星
                symbolSize: 6,
                name: `目标星 (${sat.id_number})`
            });
        }

        // 5. 刷新图表
        myChart.setOption({
            series: [{ data: chartData }]
        });
        
    }, 10000); // 10秒刷新一次
}


function initDistTimeChart() {
    const chartDom = document.getElementById('dist-time-chart');
    if (!chartDom) return;

    const myChart = echarts.init(chartDom);

    myChart.showLoading({
        text: '等待距离数据接入...',
        color: '#00ff80',
        textColor: '#fff',
        maskColor: 'rgba(20, 24, 35, 0.8)',
        zlevel: 0
    });

    // 初始空配置
    const option = {
        tooltip: {
            trigger: 'axis',
            appendToBody: true, // 让提示框突破容器限制，挂载到全局 body
            textStyle: { fontSize: 12 },
            valueFormatter: (value) => value.toFixed(1) + ' km'
        },
        grid: {
            top: 30, bottom: 20, left: 45, right: 15
        },
        xAxis: {
            type: 'category',
            // name: "时刻(s)",
            // nameTextStyle: { color: '#aaa', fontSize: 10, padding: [0, 20, 0, 0] },
            boundaryGap: false,
            data: [], // 存储时间轴数据
            axisLabel: { color: '#aaa', fontSize: 10 },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } }
        },
        yAxis: {
            type: 'value',
            name: '距离(km)',
            nameTextStyle: { color: '#aaa', fontSize: 10, padding: [0, 20, 0, 0] },
            axisLabel: { color: '#aaa', fontSize: 10 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } }
        },
        series: [] // 动态生成多条折线
    };

    myChart.setOption(option);
    // ✅ 替换为现代容器尺寸监听器 (ResizeObserver)
    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            myChart.resize();
        });
        resizeObserver.observe(chartDom);
    } else {
        window.addEventListener('resize', () => myChart.resize());
    }

    // ==========================================
    // 核心逻辑：维护历史数据阵列
    // ==========================================
    const MAX_POINTS = 30; // 屏幕上最多保留最近 30 个时间点的数据
    const timeData = [];   // X轴的时间数组
    const distanceHistory = {}; // 存储每颗子星的距离数组 { satId: [dist1, dist2...] }

    setInterval(() => {
        // 性能优化：如果该面板被隐藏了，直接退出，不耗费算力
        const chartDom = document.getElementById('dist-time-chart');

        // 如果系统处于暂停状态，图表停止向数组推入新数据
        if (typeof RenderManager !== 'undefined' && RenderManager.isPaused) return;

        // 确保双方数据都已就绪
        if (typeof satellites_friend === 'undefined' || typeof satellites_enemey === 'undefined' || 
            satellites_friend.size === 0 || satellites_enemey.size === 0) {
            return; 
        }

        myChart.hideLoading();

        // 1. 获取目标星群中心（敌方母星或一号星）
        let targetCenterData = null;
        for (let [id, record] of satellites_enemey.entries()) {
            if (record.data.isMother) {
                targetCenterData = record.data.sat_data;
                break;
            }
        }
        if (!targetCenterData) targetCenterData = Array.from(satellites_enemey.values())[0].data.sat_data;
        if (!targetCenterData) return;

        // 2. 更新时间轴 (直接读取页面顶栏的仿真时刻，如果没有则用本地时间)
        let simTimeStr = document.getElementById('simulation-time')?.textContent || "";
        if (!simTimeStr || simTimeStr === "0") {
            const d = new Date();
            simTimeStr = `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
        }
        timeData.push(simTimeStr);
        if (timeData.length > MAX_POINTS) timeData.shift();

        // 3. 遍历我方所有【子星】，计算到敌方中心的距离
        for (let [id, record] of satellites_friend.entries()) {
            // 跳过我方母星，只计算子星
            if (record.data.isMother) continue; 

            const f_data = record.data.sat_data;
            // 使用原生 Math.hypot 计算三维空间欧几里得距离，安全且高效，单位转为 km
            const dist = Math.hypot(
                f_data.x - targetCenterData.x,
                f_data.y - targetCenterData.y,
                f_data.z - targetCenterData.z
            ) / 1000;

            // 初始化该子星的数据数组
            if (!distanceHistory[id]) {
                distanceHistory[id] = new Array(timeData.length - 1).fill(null); // 对齐前面的时间点
            }
            
            distanceHistory[id].push(dist);
            if (distanceHistory[id].length > MAX_POINTS) distanceHistory[id].shift();
        }

        // 4. 组装 ECharts 格式的 series 数组
        const seriesData = [];
        for (let id in distanceHistory) {
            seriesData.push({
                name: `${id}号星`,
                type: 'line',
                smooth: true,
                symbol: 'none', // 去掉折线上的小圆点，看起来更清爽
                lineStyle: { width: 2 },
                data: distanceHistory[id]
            });
        }

        // 5. 更新图表
        myChart.setOption({
            xAxis: { data: timeData },
            series: seriesData
        });

    }, 10000); // 10秒刷新一次
}

function initTaskDistChart() {
    const chartDom = document.getElementById('task-dist-chart');
    if (!chartDom) return;

    const myChart = echarts.init(chartDom);

    // 定义基础空配置
    const option = {
        tooltip: {
            trigger: 'axis',
            appendToBody: true, // 让提示框突破容器限制，挂载到全局 body
            valueFormatter: (value) => value ? value.toFixed(2) + ' km' : '-'
        },
        grid: { top: 35, bottom: 25, left: 55, right: 15 },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: [],
            axisLabel: { color: '#aaa', fontSize: 10 },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } }
        },
        yAxis: {
            type: 'value',
            name: '相对距离 (km)',
            nameTextStyle: { color: '#00dfff', fontSize: 11, padding: [0, 10, 0, 0] },
            axisLabel: { color: '#aaa', fontSize: 10 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } }
        },
        series: [{
            name: '直线距离',
            type: 'line',
            smooth: true,
            showSymbol: false,
            lineStyle: { color: '#00dfff', width: 2 },
            areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                    { offset: 0, color: 'rgba(0, 191, 255, 0.5)' },
                    { offset: 1, color: 'rgba(0, 191, 255, 0)' }
                ])
            },
            data: []
        }]
    };

    myChart.setOption(option);
    // ✅ 替换为现代的 ResizeObserver 监听器
    if (window.ResizeObserver) {
        // 只要面板被展开或折叠，立即触发图表重绘撑满容器
        const resizeObserver = new ResizeObserver(() => {
            myChart.resize();
        });
        resizeObserver.observe(chartDom);
    } else {
        // 兜底兼容老浏览器
        window.addEventListener('resize', () => myChart.resize());
    }

    // 状态管理
    const MAX_POINTS = 40; // 记录的历史点数
    const historyMap = {}; // 结构: { 'friendId-enemyId': { times: [], distances: [] } }
    let lastMissionKey = null;

    // 每 2 秒高频刷新一次数据
    setInterval(() => {

        // 如果系统处于暂停状态，停止计算并冻结图表
        if (typeof RenderManager !== 'undefined' && RenderManager.isPaused) return;

        // 1. 检查 sat_orbit.js 中的全局变量 currentHighlightedMission
        if (typeof currentHighlightedMission === 'undefined' || !currentHighlightedMission) {
            myChart.showLoading({
                text: '请在上方“任务分配表”中点击选择任务',
                color: '#00dfff',
                textColor: '#fff',
                maskColor: 'rgba(20, 24, 35, 0.8)',
                zlevel: 0
            });
            lastMissionKey = null;
            return;
        }

        // 隐藏遮罩层
        myChart.hideLoading();

        const fId = currentHighlightedMission.friendId;
        const eId = currentHighlightedMission.enemyId;
        const missionKey = `${fId}-${eId}`; // 生成唯一任务键值

        // 如果切换了任务，清空图表视图，准备渲染新任务
        if (lastMissionKey !== missionKey) {
            myChart.clear();
            myChart.setOption(option); 
            lastMissionKey = missionKey;
        }

        // 初始化该任务的历史数据字典
        if (!historyMap[missionKey]) {
            historyMap[missionKey] = { times: [], distances: [] };
        }

        // 2. 提取双方卫星当前坐标
        if (typeof satellites_friend === 'undefined' || typeof satellites_enemey === 'undefined') return;
        
        const fRecord = satellites_friend.get(fId);
        const eRecord = satellites_enemey.get(eId);

        if (fRecord && eRecord) {
            const fSat = fRecord.data.sat_data;
            const eSat = eRecord.data.sat_data;

            // 3. 计算三维欧几里得距离 (转换为 km)
            const dist = Math.hypot(
                fSat.x - eSat.x,
                fSat.y - eSat.y,
                fSat.z - eSat.z
            ) / 1000;

            // 获取当前仿真时间
            let simTimeStr = document.getElementById('simulation-time')?.textContent || "";
            if (!simTimeStr || simTimeStr === "0") {
                simTimeStr = new Date().toLocaleTimeString('en-US', {hour12: false});
            }

            // 更新历史数组
            historyMap[missionKey].times.push(simTimeStr);
            historyMap[missionKey].distances.push(dist);

            if (historyMap[missionKey].times.length > MAX_POINTS) {
                historyMap[missionKey].times.shift();
                historyMap[missionKey].distances.shift();
            }

            // 4. 将数据更新至图表
            myChart.setOption({
                xAxis: { data: historyMap[missionKey].times },
                series: [{
                    name: `我方星${fId}号 ——> 目标星${eId}号`,
                    data: historyMap[missionKey].distances
                }]
            });
        }
    }, 2000); // 2秒刷新率，保证联动交互的灵敏度
}