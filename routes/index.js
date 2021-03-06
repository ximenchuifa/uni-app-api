//前台不登录就可以访问的接口
var express = require('express');
const formidable = require('formidable'); //处理含有文件上传的表单
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const random = require('string-random');
const { Success, MError,Guest } = require("../utils/Result");// 封装统一接口返回方法
const Db = require("../utils/Db");
const { getUUID,getToken } = require("../utils");
const {checkToken,getuid} = require("../utils"); // 登录拦截中间件
const WXBizDataCrypt = require('../utils/Node/WXBizDataCrypt') //引入解密文件
var request = require('request'); //引入request模块
var app = express();

// 引入发送短信模块（使用阿里云的短信）
const Core = require('@alicloud/pop-core');

const cookiesession = require('cookie-session');

var router = express.Router();
const tableNameCate = 'category';//商品分类
const tableNameBanner = 'banner';//轮播图
const tableNameGoods = 'goods';//商品
const tableNameSpecs = 'specs';//规格表
const tableNameMember = 'member';//会员表
const tableNameSeck = 'seckill';//限时秒杀表
const tableNameWXUser = 'member_ceshi';//微信登录测试使用
const tableNameCode = 'code';//微信登录测试使用
   //javascript  树形结构
   function toTree(data) {
        // 删除 所有 children,以防止多次调用
        data.forEach(function(item) {
            delete item.children;
        });

        // 将数据存储为 以 id 为 KEY 的 map 索引数据列
        var map = {};
        data.forEach(function(item) {
            // 在该方法中可以给每个元素增加其他属性
            // item.text = item.name;
            if(item.pid == 0){
                // console.log(item.pid)
                map[item.id] = item;
            }  
        });
        // console.log(map);
        var val = [];
        data.forEach(function(item) {
            // 以当前遍历项的pid,去map对象中找到索引的id
                var parent = map[item.pid];
                // 如果找到索引，那么说明此项不在顶级当中,那么需要把此项添加到，他对应的父级中
                if (parent) {
                    //  添加到父节点的子节点属性中
                    (parent.children || (parent.children = [])).push(item);
                } else {
                    //如果没有在map中找到对应的索引ID,那么直接把 当前的item添加到 val结果集中，作为顶级
                    val.push(item);
                }
        });

        return val;
    }

// 商品搜索
router.get('/search',async(req,res)=>{
    const {keywords} = req['query'];
    if(!keywords){
        res.send(MError("缺少必要条件"));
        return;
    }
    let data = await Db.select(req, `SELECT id,goodsname,price,market_price,img FROM ${tableNameGoods} WHERE goodsname like '%${keywords}%' `);
    res.send(Success(data));
})


//获取分类信息
router.get("/getcate", async (req, res) => {
    let data = await Db.select(req, `SELECT * FROM ${tableNameCate} WHERE pid = 0 AND status = 1`);
    res.send(Success(data));
});

// 获取所有商品分类数据 返回分类树（递归）
router.get("/getcates", async (req, res) => {
    let data = await Db.select(req, `SELECT * FROM ${tableNameCate} WHERE status = 1`);
    // const data = await Db.select(req, `SELECT a.*,b.id,b.goodsname,b.img FROM ${tableNameCate} a LEFT JOIN ${tableNameGoods} b ON a.id = b.second_cateid WHERE a.status = 1`);
    // console.log(data)
    // 将数据排序 父与子关系
    data = toTree(data)
    // console.log(data)
    res.send(Success(data));
});

//获取轮播图信息
router.get("/getbanner", async (req, res) => {
    let data = await Db.select(req, `SELECT * FROM ${tableNameBanner} WHERE status = 1`);
    // console.log(data)
    res.send(Success(data));
});

//获取限时秒杀
router.get("/getseckill",async(req,res)=>{
	
    // 当天0点
    var start = new Date(new Date(new Date().toLocaleDateString()).getTime()).getTime(); 
    // 当天23:59
    var end = new Date(new Date(new Date().toLocaleDateString()).getTime() + 24 * 60 * 60 * 1000 - 1000).getTime();
    let sql = `SELECT a.*,b.img,b.price FROM ${tableNameSeck} a LEFT JOIN ${tableNameGoods} b ON a.goodsid = b.id WHERE begintime >= ${start} AND endtime <= ${end}`;
    console.log(sql)
    let data = await Db.select(req,`SELECT a.*,b.img,b.price FROM ${tableNameSeck} a LEFT JOIN ${tableNameGoods} b ON a.goodsid = b.id WHERE begintime >= ${start} AND endtime <= ${end}`);
    res.send(Success(data));
})

//获取首页商品-推荐、最新上架、所有商品
router.get("/getindexgoods",async(req,res)=>{
	let data1 = await Db.select(req, `SELECT id,goodsname,price,market_price,img FROM ${tableNameGoods} WHERE status = 1 AND ishot = 1 LIMIT 10`);
	let data2 = await Db.select(req, `SELECT id,goodsname,price,market_price,img FROM ${tableNameGoods} WHERE status = 1 AND isnew = 1 LIMIT 10`);
	let data3 = await Db.select(req, `SELECT id,goodsname,price,market_price,img FROM ${tableNameGoods} WHERE status = 1 LIMIT 10`);
	let data = [];
	data.push({content:data1});
	data.push({content:data2});
	data.push({content:data3});
	res.send(Success(data));
});

//获取一级分类下商品
router.get("/getcategoods",async(req,res)=>{
    const {fid} = req['query'];
    if(!fid){
        res.send(MError("缺少必要条件"));
        return;
    }
    let data = await Db.select(req, `SELECT id,goodsname,price,market_price,img FROM ${tableNameGoods} WHERE status = 1 AND first_cateid = ${fid}`);
    res.send(Success(data));
});

//获取一级分类下商品 分页版本
router.get("/getcategoodPage", async (req, res) => {
    const { size,page,fid } = req['query'];
    if(!fid){
        res.send(MError("缺少必要条件"));
        return;
    }
    let sql = `SELECT id,goodsname,price,market_price,img FROM ${tableNameGoods} WHERE status = 1 AND first_cateid = ${fid}`
    if(size && page){
        let pagesize = (page-1)*size;//设置偏移量
    	sql += ` LIMIT ${pagesize},${size} `;
    }
    // console.log(sql)
    let gooddata = await Db.select(req,sql);
    // 获取总页数
    let countSql = `SELECT count(id) as count FROM ${tableNameGoods} WHERE status = 1 AND first_cateid = ${fid}`;
    let countNum = await Db.select(req,countSql);
    let totalPage = Math.ceil(countNum[0].count / size);
    console.log(totalPage);
    // 组装商品数据和总页码
    let data = [totalPage,gooddata]
    res.send(Success(data));
});

//获取二级分类下商品 分页版本
router.get("/getsecondcategoodPage", async (req, res) => {
    const { size,page,sid } = req['query'];
    if(!sid){
        res.send(MError("缺少必要条件"));
        return;
    }
    let sql = `SELECT id,goodsname,price,market_price,img FROM ${tableNameGoods} WHERE status = 1 AND second_cateid = ${sid}`
    if(size && page){
        let pagesize = (page-1)*size;//设置偏移量
    	sql += ` LIMIT ${pagesize},${size} `;
    }
    // console.log(sql)
    let gooddata = await Db.select(req,sql);
    // 获取总页数
    let countSql = `SELECT count(id) as count FROM ${tableNameGoods} WHERE status = 1 AND second_cateid = ${sid}`;
    let countNum = await Db.select(req,countSql);
    let totalPage = Math.ceil(countNum[0].count / size);
    // console.log(totalPage);
    // 组装商品数据和总页码
    let data = [totalPage,gooddata]
    res.send(Success(data));
});

//获取一条商品信息
router.get("/getgoodsinfo", async (req, res) => {
    const {id} = req['query'];
    if (!id) {
        res.send(MError("缺少必要条件"));
        return;
    }
    const info = await Db.select(req, `SELECT a.*,b.specsname FROM ${tableNameGoods} a LEFT JOIN ${tableNameSpecs} b ON a.specsid = b.id WHERE a.id = '${id}'`);
    res.send(Success(info, '获取成功'));
});
//注册
router.post("/register", async (req, res) => {
    let { phone,nickname,password } = req['body'];
    const info = await Db.select(req, `SELECT * FROM ${tableNameMember} WHERE phone = '${phone}'`);
    if (info) {
        res.send(MError("手机号已存在，不能重复！"));
    } else {
        const randstr = random(5);
        password += randstr;
        password = crypto.createHash('md5').update(password).digest("hex");
        const result = await Db.insert(req, tableNameMember, {
            uid: getUUID(),
            phone,
            nickname,
            password,
            randstr,
            addtime:new Date().getTime(),
            status:1//新注册
        });
        if (result) {
            res.send(Success([], "注册成功"));
        } else {
            res.send(MError("注册失败"));
        }
    }
});

//登录
router.post("/login", async (req, res) => {
    let { phone,password } = req['body'];
    if(!phone || !password){
        res.send(MError("请填写手机号和密码"));
        return;
    }
    const result = await Db.select(req, `SELECT * FROM ${tableNameMember} WHERE  phone = '${phone}'`)
    if(result === null){
        res.send(MError("用户信息不存在"));
        return;
    }
    const info = result[0];
    password += info.randstr;
    password = crypto.createHash('md5').update(password).digest("hex");
    if(password !== info.password){
        res.send(MError("用户名密码错误"));
        return;
    }
    // 当用户登录时，直接获取登录时的token返给前端 ，有效时间为60秒
    let token = getToken(info['uid']);
    let data = {
    	token,uid:info.uid,phone:info.phone,nickname:info.nickname
    }
    res.send(Success(data, '登录成功'));
});


// ==========================================================小程序的登录接口=============================================================
/*
    小程序登录接口，   let  token = getToken(info['uid']);登录成功之后，也得需要token，前台获取购物车信息需要token
*/
// 使用阿里云发送手机验证码短信
router.get('/sms',async(req,res)=>{
    // 获取手机号
    const {phone} = req['query'];

    // 根据手机号从数据库中查询60分钟内是否有发送记录有的话直接返回
    let result = await Db.select(req, `SELECT * FROM ${tableNameCode} WHERE  phone = '${phone}'  order by addtime desc limit 1;`)
    result = result == null ? [{addtime:0}] : result;
    // if(result != null){

    // }

    let addtime = result[0].addtime;
    let nowtime = new Date().getTime();
    if(nowtime - addtime > 21600000){//如果超过6个小时就重新获取 为了节省资源,哈哈
        // 注意accessKeyId和accessKeySecret需要在阿里云用户中心获取
        var client = new Core({
          accessKeyId: 'LTAIAZOhmLV1oBTa',
          accessKeySecret: 'XRHb4FJD3h1gYgCkhtuXUqr4SXyo5M',
          endpoint: 'https://dysmsapi.aliyuncs.com',
          apiVersion: '2017-05-25'
        });

        // 生成手机随机验证码
        function rand(min,max) {
            return Math.floor(Math.random()*(max-min))+min;
        }
    
        var code = rand(1000,9999);
        var params = {
            "RegionId": "cn-hangzhou",
            "PhoneNumbers": phone,
            "SignName": "蘑菇街商城学习",
            "TemplateCode": "SMS_171116888",
            "TemplateParam": JSON.stringify({code})
        }

        var requestOption = {
            method: 'POST'
        };
        client.request('SendSms', params, requestOption).then((result) => {
            console.log(JSON.stringify(result));
        }, (ex) => {
            console.log('错误了')
            console.log(ex);
            res.send(MError("发送失败"));
        })
        
        // 成功后将验证码和手机号信息存储到数据库中
        const result = await Db.insert(req, tableNameCode, {phone,code,addtime:new Date().getTime()});
        res.send(Success({'code':code}, '获取成功'));
    }else{//否则返回之前获取的
        res.send(Success({'code':result[0].code}, '获取成功'));
    }
})
// 微信小程序登录手机验证码方式
router.get('/wxlogin',async(req,res)=>{
    //获取前台传递的手机号和手机验证码
    const{phone} = req['query'];
    // 判断参数是否为空
    if(phone == ''){
        res.send(MError('请填写信息'))
    }
    // console.log( req.session.code);
    // 获取当前手机号的验证码
    // let code_session = req.session.code || '请先获取验证码';
    // if(!code_session == '请先获取验证码'){//如果失效
    //     res.send(MError(code_session));
    // }else if(code == code_session){//验证码不正确
    //     res.send(MError('验证码错误'));
    // }else{//验证码验证通过
        // 继续处理判断该用户手机号之前是否登录（既注册过，登录即注册）过，登录过就返回对应的uid和token，没有就新建一条数据并返回相关数据（uid、、、）
        // 根据手机号查询记录
        const result = await Db.select(req, `SELECT * FROM ${tableNameMember} WHERE phone = '${phone}'`);
        let info = result ? result[0] : null; 
        // console.log(info);
        // res.end();return;
        if(info){
            let token = getToken(info['uid']);//获取token
            let data = {//组装返回数据   微信登录的用户没有昵称注意也可以随机生成一个
                token,uid:info.uid,phone:info.phone
            }
            res.send(Success(data,'登录成功'));
        }else{
            //该用户第一次登录就注册用户数据到数据库中
            let uid = getUUID();//随机获取uid
            let token = getToken(uid);//获取token
            const result = await Db.insert(req, tableNameMember, {
                uid,
                phone,
                addtime:new Date().getTime(),
                status:1//新注册
            });
            if (result) {
                let data={token,uid,phone:phone};
                res.send(Success(data, "恭喜首次登录成功"));
            } else {
                res.send(MError("登录失败"));
            }
        }
    // }
})

// 微信登录(微信登录案例测试接口,注意此接口和uniapp项目没有关系就只是测试微信登录) 
router.get('/wxceshilogin',(req,res)=>{
    //注意事项  code有失效期  就是一个code使用一次
   var Code = req.query.code;                       //获取前台传过来的code
   var APPID = 'wx2f26909d14cc3fdf';                //换成自己的appid公众后台获取
   var SECRET = '1db15389d600d5cd8a6f223749445744'; //换成自己的秘钥去公众后台获取
   var urls = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${Code}&grant_type=authorization_code`;
   //安装request模块  npm install request
    request(urls,async(err,response,body)=>{
       let {session_key,openid}  = JSON.parse(body);
        //根据openid去mongo数据库获取数据
        const result = await Db.select(req, `SELECT * FROM  ${tableNameMember} WHERE openid = '${openid}' `);
        let info = result ? result[0] : null; 
        if(info){
            let token = getToken(info['uid']);//获取token
            res.send(Success({uid:info.uid,token}, '登录成功'));//给前台返回uid存储在本地缓存中
        }else{
            //该用户第一次登录就注册用户数据到数据库中
            let uid = getUUID();//随机获取uid(用户在后台的身份标识)
            let token = getToken(uid);//获取token
            const result = await Db.insert(req, tableNameMember, {uid,session_key,openid,addtime:new Date().getTime()});
            if (result) {
                res.send(Success({uid,token}, "恭喜首次登录成功"));//给前台返回uid存储在本地缓存中
            } else {
                res.send(MError("登录失败"));
            }
        }
   });
});

// token校验接口  注意测试路由需要在config\global.js文件中配置路径
router.get('/checktoken',async(req,res)=>{
    if (!req.headers.authorization) {
        console.log(111)
        res.send(MError([], "请设置请求头,并携带验证字符串"));
    }else if (!await checkToken(req)) { // 过期  
        console.log(222)
        res.send(Guest([], "登录已过期或访问权限受限"));
    } else {
        res.send(Success({}, "登录有效"));//给前台返回uid存储在本地缓存中
        res.end();
    }
})

//解密获取用户的手机号  因为个人开发者是不允许获取手机此功能待开发后续,实例代码可以参考ndo文件夹下demo.js......
router.get('/jiemi',async(req,res)=>{
    // 获取基本参数  adcf63ce1fa46774eecab6c429ebf70e
    // let {encryptedData,iv} = req['query'];
        
    // var appId = ''
    // var sessionKey = 'tiihtNczf5v6AKRyjwEUhQ=='
    
})




module.exports = router;