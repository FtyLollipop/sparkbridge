const { read } = require("../../handles/file");
const { formatMsg } = require("../spark.mc");
const winston = require('winston');
const dayjs = require('dayjs');
let today = dayjs();

const logger = winston.createLogger({
    format: winston.format.printf((info) => {
        return `${today.format("YYYY-MM-DD h:mm:ss")} [${info.level}] spark.regex | ${info.message}`
    }),
    transports: [
        new winston.transports.Console()
    ]
});
/**
 * 
 * @param {String} str 
 * @param {RegExpMatchArray} reg 
 * @returns 
 */
function buildString(str, reg, e) {
    var i = 0;
    reg.forEach(s => {
        str = str.replace(`\$${i}`, s);
        i++
    });
    if (str.includes("%")) {
        let str_arr = buildPlaceHolder(str);
        return str_arr.map((t)=>{
            if(t.type == 'holder'){
                return getPlaceHolder(t.raw,e);
            }else{
                return t.raw;
            }
        }).join("");
    }else{
        return str;
    }

}


const Cmds = new Map();

function regCmd(head, cb) {
    Cmds.set(head, cb);
}

spark.regCmd = regCmd;

function runCmd(_first, _args, reg, e, adapter) {
    if (Cmds.has(_first)) {
        try {
            Cmds.get(_first)(_args, reg, e, adapter);
        } catch (err) { console.log(err) }
    }
}

regCmd('reply', (_arg, reg, e, adapter) => {
    let txt1 = buildString(_arg, reg, e);
    e.reply(txt1);
});

regCmd('f', (_arg, reg, e, adapter) => {
    let t_and_a = _arg.split(':');
    if (t_and_a.length == 0) {
        logger.warn(`执行正则表达式遇到错误：参数不足，请指定私聊联系人`);
    }
    let target = t_and_a[0];
    let arg = t_and_a[1];
    adapter.sendFriendMsg(Number(target), buildString(arg, reg, e))
});

regCmd('g', (_arg, reg, e, adapter) => {
    let t_and_a = _arg.split(':');
    if (t_and_a.length == 0) {
        logger.warn(`执行正则表达式遇到错误：参数不足，请指定群号`);
    }
    let target = t_and_a[0];
    let arg = t_and_a[1];
    adapter.sendGroupMsg(Number(target), buildString(arg, reg, e))
})

regCmd('t', (arg, reg, e, adapter) => {
    let t_and_m = arg.split(':');
    let tp = t_and_m[0];
    let ms = t_and_m[1];
    if (tp == 'all') {
        mc.broadcast(buildString(ms, reg));
    } else {
        let top = mc.getPlayer(tp);
        if (top) {
            top.tell(buildString(ms, reg, e));
        }
    }
})
regCmd('run', (arg, reg, e, adapter) => {
    let command = arg;
    let r = mc.runcmdEx(buildString(command, reg, e));
    e.reply(r.success ? r.output : command + '执行失败');
})
/**
 * 
 * @param {String} cmd 
 */
function commandParse(cmd, reg, e, _adapter) {
    let items = cmd.split("|");
    if (items.length == 1) {
        logger.warn(`执行正则表达式：${cmd} 遇到错误：参数不足，请写入参数`);
    }
    let _first = items[0];
    let _arg = items[1];
    if (spark.DEBUG)
        logger.info('执行正则表达式命令：' + _first + ',参数：' + _arg);
    runCmd(_first, _arg, reg, e, _adapter);
}

const PlaceHolders = new Map();

function regPlaceHolder(key,recall){
    PlaceHolders.set(key,recall);
}

spark.regPlaceHolder = regPlaceHolder;

regPlaceHolder('NAME',(e)=>{
    return spark.XUIDDB.get(e.sender.user_id.toString()) == undefined ? e.sender.nickname : spark.XUIDDB.get(e.sender.user_id.toString()) 
});

regPlaceHolder('NICKNAME',(e)=>{
    return e.sender.nickname;
});

regPlaceHolder('XBOXID',e=>{
    return spark.XUIDDB.get(e.sender.user_id.toString());
})

async function test_time(){
    return new Promise((res,rej)=>{
        setTimeout(() => {
            res();
        }, 3e3);
    })
}

regPlaceHolder('WAIT',async (e)=>{
    await test_time();
    return 'ok';
})

regPlaceHolder('CARD',e=>{
    return e.sender.card;
})

function getPlaceHolder(key,e){
    if(PlaceHolders.has(key)){
        return PlaceHolders.get(key)(e);
    }else{
        return 'null';
    }
}

function buildPlaceHolder(raw) {
    let out_raw = [];
    // 是否正在匹配
    let matching = false;
    // 正在匹配的字符串
    let matching_now = '';
    // 是否跳过当前转义
    let skip_next = false;
    for (let i in raw) {
        let now_i = raw[i];
        //console.log('匹配：'+now_i);
        if(skip_next == false){ // 需要进行变量判断
            if(now_i == '\\'){  // 需要直接写入下一位
               skip_next = true;
               //console.log('跳过判断下一位');
            }else if(now_i == '%'){
                // 开始或者结束匹配变量
                if(matching){
                    matching = false;
                    out_raw.push({type:'holder',raw:matching_now});
                    matching_now = '';
                }else{
                    matching = true;
                }
            }else{
                if(matching){
                    matching_now += now_i;
                }else{
                    out_raw.push({type:'plan',raw:now_i})
                }
            }
        }else{ //需要直接写入当前字符串
            out_raw.push({type:'plan',raw:now_i})
            skip_next = false;
        }
    }
    return out_raw;
}

function onStart(_adapter) {
    let group = spark.GROUP;
    let admin = spark.ADMINS;
    let config = spark.JSON5.parse(read('./plugins/sparkbridge/' + info().name + '/config.json'));
    _adapter.on('bot.message.group', (e) => {
        if (e.group !== group) return;
        if (e.raw_message == '重载正则') {
            if (spark.ADMINS.includes(e.sender.user_id) == false) return;
            try {
                config = spark.JSON5.parse(read('./plugins/sparkbridge/' + info().name + '/config.json'));
                e.reply("正则表达式已重载");
            } catch (errr) {
                e.reply('重载失败：' + errr.toString());
            }
        }
        let raw = formatMsg(e.message);
        for (let reg_it in config) {
            let tmp = raw.match(reg_it);
            if (tmp == null) continue;
            if (config[reg_it].adm && !admin.includes(e.sender.user_id)) {
                return;
            }
            try {
                config[reg_it].cmd.split(';').forEach(regtmp => {
                    commandParse(regtmp, tmp, e, _adapter);
                })
            } catch (err) {
                console.log(err);
            }
        }
    })
}


function info() {
    return {
        name: 'spark.regex',
        author: 'lition',
        desc: '适用于sparkbridge的正则表达式模块',
        version: [0, 0, 2]
    }
}

module.exports = { onStart, info }