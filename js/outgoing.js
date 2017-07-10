//导入3tee sdk后，定义变量，用于调用接口
var AVDEngine = ModuleBase.use(ModulesEnum.avdEngine);
var avdEngine = new AVDEngine();

//服务器uri和rest接口uri，此处使用的是3tee的测试服务器地址
//服务器地址的两种写入方式，写死或者从demo.3tee.cn/demo中获取
var serverURI = null;
var restURI = serverURI;
var accessKey = null;
var secretKey = null;
//var serverURI = "nice2meet.cn";//可以写死服务器地址
//var accessKey = "demo_access";//可以写死key
//var secretKey = "demo_secret";

function demoGetServerUrl(){//可以通过demo.3tee.cn/demo获取
	var deferred = when.defer();
	var demoUrl = protocolStr + "//demo.3tee.cn/demo/avd_get_params?apptype=rtsp&callback=?";
	$.ajax({
		type: "get",
		url: demoUrl,
		dataType: "jsonp",
		timeout: 5000,
		success: function(data) {
			deferred.resolve(data);
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			log.info("ajax (avd/api/admin/getAccessToken) errorCode:" + XMLHttpRequest.status + ",errorMsg:" + XMLHttpRequest.statusText);
			var error = {};
			error.code = XMLHttpRequest.status;
			error.message = XMLHttpRequest.statusText;
			deferred.reject(error);
		}
	});
	return deferred.promise;
}

demoGetServerUrl().then(function(data) {
	showLog("获取demo服务器地址成功");
	serverURI = data.server_uri;
	restURI = serverURI;
	accessKey = data.access_key;
	secretKey = data.secret_key;
	doGetAccessToken();
}).otherwise(alertError);

var accessToken = null;

//变量定义，以及页面元素定义
var roomId = GetQueryString('roomId');
var remoteVideo = document.getElementById("remoteVideo");
var remoteAudio = document.getElementById("remoteAudio");
var currentUserId = null;  //记录页面中video显示的视频的userId，方便切换和关闭
var userId2Stream = {}; //记录每个userId发布的stream，方便切换

//1.首先获取accessToken
function getAccessToken() {
	var deferred = when.defer();
	var protocolStr = document.location.protocol;
	var accessTokenUrl = protocolStr + "//" + restURI + "/avd/api/admin/getAccessToken?callback=?&mcuServerURI=" + serverURI + "&accessKey=" + accessKey + "&secretKey=" + secretKey;
	$.ajax({
		type: "get",
		url: accessTokenUrl,
		dataType: "jsonp",
		timeout: 5000,
		success: function(retObject) {
			var ret = retObject.result;
			if (ret == 0) {
				var retData = retObject.data;
				var accessToken = retData.accessToken;
				deferred.resolve(accessToken);
			} else {
				var error = {};
				error.code = ret;
				error.message = retObject.err;
				deferred.reject(error);
			}
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			log.info("ajax (avd/api/admin/getAccessToken) errorCode:" + XMLHttpRequest.status + ",errorMsg:" + XMLHttpRequest.statusText);
			var error = {};
			error.code = XMLHttpRequest.status;
			error.message = XMLHttpRequest.statusText;
			deferred.reject(error);
		}
	});

	return deferred.promise;
};

function doGetAccessToken(){
	getAccessToken().then(function(_accessToken) {
		showLog("生成访问令牌成功");
		accessToken = _accessToken;
		if(roomId == null || roomId == 0){     //roomId不存在时，创建新房间
			try {
				createRoom();
			} catch(error) {
				alertError(error);
			}
		} else {      //存在roomId，直接加会
			joinRoom(accessToken,roomId);
		}
	}).otherwise(alertError);
}

//2.创建一个新房间
function doCreateRoom(_accessToken) {
	var deferred = when.defer();
	var protocolStr = document.location.protocol;
	
	var roomMode = 1;
	var topic = 'outgoingMeeting';
	var maxVideo = 5;
	var maxAudio = 5;
	var hostPassword = '654321';

	var urlStr = protocolStr + "//" + serverURI + "/rtc/room/create?callback=test&owner_id=111111&access_tocken=" + accessToken + "&room_mode=" + roomMode + "&topic=" + topic + "&max_video=" + maxVideo + "&max_audio=" + maxAudio + "&host_password=" + hostPassword;
	$.ajax({
		type: "get",
		url: urlStr,
		dataType: "jsonp",
		timeout: 5000,
		success: function(retObj) {
			if ("0" == retObj.ret) {
				var roomId = retObj.room_id;
				deferred.resolve(roomId);
			} else {
				var error = {};
				error.code = retObj.ret;
				error.message = retObj.msg;
				deferred.reject(error);
			}
		},
		error: function(XMLHttpRequest, textStatus, errorThrown) {
			var error = {};
			error.code = XMLHttpRequest.status;
			error.message =  XMLHttpRequest.statusText;
			deferred.reject(error);
		}
	});

	return deferred.promise;
};

function createRoom(){	
	doCreateRoom(accessToken).then(function(_roomId) {
		showLog("生成会议成功");
		roomId = _roomId;
		joinRoom(accessToken,roomId);
	}).otherwise(alertError);
}

//3.加入会议,分为3步
function joinRoom(accessToken,roomId){
	//第一步，初始化引擎
	avdEngine.init(serverURI, accessToken).then(function(){
		showLog("引擎初始化成功");
		//第二步，加入会议
		var userName = "js:" + getRandomNum(1000, 30000) + "";   //生成随机用户名
		var userId = userName; //userID也是随机
		var userData = "";
		var password = "";
		
	    room = avdEngine.obtainRoom(roomId);
		room.join(userId, userName, userData, password).then(function(){
			showLog("加入会议成功");
			//第三步，处理回调，订阅视频等
			registerRoomCallback();     
		    onPublishCameraNotify(room.pubVideos); //加会登陆前，会议中已经发布的视频资源,采取订阅处理
		    participantsHandle(room.getParticipants());
		    showLog("加会成功后订阅视频等");
		    
		    autoGenerateOutgoingUserInfo();  //加会成功以后，自动生成外部用户信息，详见第四步
		    //getOutgoingUsers(); //加会成功以后，获取已有的所有外部设备，并显示
		}).otherwise(alertError);
	}).otherwise(alertError);
}

/**
 * 注册房间级别的回调
 */
function registerRoomCallback() {	
	room.addCallback(RoomCallback.user_join_notify, onUserJoinNotify);
	room.addCallback(RoomCallback.user_leave_notify, onUserLeaveNotify);
}

/**
 * @desc 参会者加会回调
 * @param {Object} users － 参会者数组
 */
function onUserJoinNotify(users) {
	participantsHandle(users);
}

/**
 * @desc 参会者退会回调
 * @param {int} opt - 退会类型
 * @param {int} reason  - 退会原因
 * @param {Object} user - 退会用户
 */
function onUserLeaveNotify(opt,reason,user) {
	if(reason == 807 && user.id == document.getElementById("userId").value) {
		alert("807错误，UDP不通或UDP连接超时！");
		return;
	}
}

function participantsHandle(participants) {
	participants.forEach(function(user) {		
		user.addCallback(UserCallback.publish_camera_notify, onPublishCameraNotify);
		user.addCallback(UserCallback.unpublish_camera_notify, onUnpublishCameraNotify);
		user.addCallback(UserCallback.subscrible_camera_result, onSubscribleCameraResult);
        user.addCallback(UserCallback.unsubscrible_camera_result, onUnsubscribleCameraResult);
        
        user.addCallback(UserCallback.subscrible_microphone_result, onSubscribleMicrophoneResult);
        user.addCallback(UserCallback.unsubscrible_microphone_result, onUnsubscribleMicrophoneResult);     
		
	});
}

function onPublishCameraNotify(videos) {
	videos.forEach(function(video) {
		 //只订阅末订阅过的视频
		 var  subVideoIdsLen  = room.selfUser.subVideoIds.length;
		 if(subVideoIdsLen > 0){
			 for(var i = 0; i < room.selfUser.subVideoIds.length; i++){
	    	     	  var videoId = room.selfUser.subVideoIds[i];
	    	     	  if(video.id != videoId){
	    	     	  	 video.subscrible();
		          }
	    	     }
		 }else{
		 	 video.subscrible();
		 }
	});
}

function onUnpublishCameraNotify(video) {
	video.unsubscrible();
}

/**
 * 订阅远端视频流反馈
 * @param {Object} stream － 远端视频流
 * @param {Object} userId － 所属用户ＩＤ
 * @param {Object} userName－ 所属用户名称
 * @param {Object} cameraId－ 摄像头设备ＩＤ
 */
function onSubscribleCameraResult(stream, userId, userName,cameraId) {
	userId2Stream[userId] = stream;
	if(userName.indexOf("outgoing") > -1 || userName.indexOf("rtsp") > -1 || userName.indexOf("h323") > -1){
		room.selfUser.attachVideoElementMediaStream(remoteVideo, stream);
		currentUserId = userId;
	}
}


/**
 * 取消订阅远端视频流反馈
 * @param {Object} userId－ 所属用户ＩＤ
 * @param {Object} userName－所属用户名称
 * @param {Object} cameraId－摄像头设备ＩＤ
 */
function onUnsubscribleCameraResult(userId, userName,cameraId){
	if(currentUserId == userId){
		attachMediaStream(remoteVideo, null);
	}
	delete userId2Stream[userId];
}

/**
 * 订阅远端音频流反馈
 * @param {Object} stream－ 远端音频流
 * @param {Object} userId－ 所属用户ＩＤ
 * @param {Object} userName－所属用户名称
 */
function onSubscribleMicrophoneResult(stream, userId, userName){
    room.selfUser.attachAudioElementMediaStream(remoteAudio, stream);
}


/**
 * 取消订阅远端音频流反馈
 * @param {Object} userId－ 所属用户ＩＤ
 * @param {Object} userName－所属用户名称
 */
function onUnsubscribleMicrophoneResult(userId, userName){
	attachMediaStream(remoteAudio, null);
}

//4.自动生成导入外部设备时，需要的userName，userId，并在页面上显示
function autoGenerateOutgoingUserInfo(){
	showLog("自动生成外部设备userId等");
	var userName = "js_outgoing:" + getRandomNum(1000, 30000) + "";   //生成随机用户名
	var userId = userName; //userID也是随机
	
	//console.log(roomId + "===" + userId);
	$("#userName").val(userName);
	$("#userId").val(userId);
	$("#roomId").val(roomId);
}

//5.导入外部设备、关闭外部设备和获取房间内所有外部设备
function createOutgoingUser() {
	var roomId = document.getElementById("roomId").value;
	var userId = document.getElementById("userId").value;
	var userName = document.getElementById("userName").value;
	var userAddress = document.getElementById("userAddress").value;
	var userData = '';
	
	var loginName = document.getElementById("loginName").value;
	var loginPassword = document.getElementById("loginPassword").value;
	var assAddress = document.getElementById("assAddress").value;
	options = '{"login_name":"' + loginName + '","login_password":"' + loginPassword + '","assist_address":"' + assAddress + '"}';//设备帐号、设备密码等需要组合成options参数传入
	showLog("导入外部设备开始");
	
	var outgoing = avdEngine.obtainOutgoing(restURI);
	
	outgoing.createOutgoingUser(accessToken, roomId, userId, userName, userAddress, userData, options).then(function(data) {
		showLog("导入外部设备成功！返回信息：" + JSON.stringify(data));
		
		getOutgoingUsers(); //导入成功以后，更新设备列表
	}).otherwise(alertError);
}

function destroyOutgoingUser() {
	var roomId = document.getElementById("roomId").value;
	var userId = document.getElementById("userId").value;
	var userAddress = document.getElementById("userAddress").value;
	
	var outgoing = avdEngine.obtainOutgoing(restURI);
	outgoing.destroyOutgoingUser(accessToken, roomId, userAddress, userId).then(function(data) {
		showLog("关闭外部设备成功！返回信息：" + JSON.stringify(data));
		
		if(currentUserId == userId){          //如果关闭的设备就是当前显示的设备，就把流置为null
			attachMediaStream(remoteVideo, null);			
		}
		delete userId2Stream[userId]; //清空对象中，此userId的内容
		getOutgoingUsers(); //关闭成功以后，更新设备列表
	}).otherwise(alertError);
}

function getOutgoingUsers() {
	var roomId = document.getElementById("roomId").value;
	var outgoing = avdEngine.obtainOutgoing(restURI);
	outgoing.getOutgoingUsers(accessToken, roomId).then(function(data) {
		showLog("获取房间所有外部设备成功！");
		showAllOutgoingDevice(data);
	}).otherwise(alertError);
}

//在页面中显示房间中所有的设备列表
function showAllOutgoingDevice(data){
	$("#deviceList").empty();
	for(var i = 0; i < data.total ; i ++){
		var item = data.items[i];
		var proto = "";
		if(item.user_address.indexOf('rtsp') > -1){
			proto = "rtsp";
		}
		if(item.user_address.indexOf('h323') > -1){
			proto = "h323";
		}
		var newHtml = "<span onclick='changeVideoShow(\"" + item.user_id + "\")'>" + item.user_name + "[" + proto + "]</span>";
		$("#deviceList").append(newHtml);
	}
	if(data.total == 0){
		$("#deviceList").append('<span>无外部设备</span>');
	}
}

//改变video显示的流
function changeVideoShow(userId){
	if(currentUserId == userId){
		return ;  //如果当前视频就是需要切换的视频，则无需切换
	}
	
	room.selfUser.attachVideoElementMediaStream(remoteVideo, userId2Stream[userId]);
}

//双击全屏查看
fullScreenInit();
remoteVideo.ondblclick = function(e) {
	if(currentUserId == null) {
		return false;
	}
	doFullScreen(remoteVideo, e);
};

//获取访问url的访问参数
function GetQueryString(name) {
	var reg = new RegExp("(^|&)" + name + "=([^&]*)(&|$)", "i");
	var r = window.location.search.substr(1).match(reg);
	if(r != null) {
		return unescape(r[2]);
	}
	return 0;
}

//统一日志显示，在页面最下方显示步骤进度
function showLog(content){
	var myDate = new Date();
	var currentTime =  myDate.getHours() + ":" + myDate.getMinutes() + ":" + myDate.getSeconds();
	var showContent = currentTime + " " + content;
	if(content.indexOf("错误") > -1){
		showContent = "<span style='color:red'>" + showContent + "</span>";
	}
	$("#resultShow").html($("#resultShow").html() + showContent + "<br>");
	$("#jp-container").scrollTop( $('#jp-container')[0].scrollHeight);
}

//统一错误处理，把错误alert出来
function alertError(error){
	//alert("错误原因：" + "error code:" + error.code + "; error message:" + error.message);
	showLog("错误原因：" + "error code:" + error.code + "; error message:" + error.message);
}
