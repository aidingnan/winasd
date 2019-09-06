# 1. Interfaces

本文档是spec的一部分；用于描述winasd依赖和提供的接口。

## 1.1. Dependent Interfaces

## 1.2. Provided Interfaces

winasd提供三种接口：

1. 对云或者客户端而言，可以trigger winasd行为的接口，该接口通过winasd与iot之间的mqtt通讯实现；称为channel接口；
2. 对客户端而言，通过http/https服务提供的接口，称为http接口；
3. 对客户端而言，通过ble广播和gatt服务提供的接口，称为ble接口；

# 2. Ble接口

## advertisement

ble advertisement提供了设备名和设备状态信息，状态信息编码在manufacturer data里。

设备状态名约定格式为

```
pan-NNNN
```

其中NNNN为设备的User Serial Name的前四位数字；

设备状态信息使用manufacturer data编码，其中第一个字段为当前设备绑定状态，

- 0x00，ble服务尚不能确定设备绑定状态（依赖服务尚未启动或故障）
- 0x01，未绑定
- 0x02，已绑定
- 0x03，winasd无法确定绑定状态，最常见的原因是设备刷机之后丢失用户文件且无法联网获取。

### addAndActive (connect wifi)

### addAndActiveAndBound (connect wifi and bind)

### (new) cleanVolume

### bind ???

### unbind ???

# 3. Http接口

### GET /

say hello

### GET /info

由appService.view提供

### PATCH /winasd

shutdown, reboot, root, unroot，由appService.PATCH提供

### GET /winasd/info

与`/info`重复，取消

### GET /winasd/upgrade

appService.upgrade.LIST({}, req.body, ...)

### POST /winasd/device

更新设备名称，appService.updateDeviceName(req.user, req.body.name...)

### PATCH /winasd/localAuth

request local token

appService.localAuth.request

### POST /winasd/localAuth

appService.localAuth.auth(req.body...)

### POST /winasd/bind

NO token???

appService.requestBind(req.body.encrytped)

### POST /winasd/unbind

req.body.encrypted
req.body.authToken
req.body.cleanVolume (boolean)

appService.requestUnbind(encrypted, cleanVolume)

### GET /winasd/timedate

```js
req.body {
  camel: true or false // defaul false
}
```

```js
{ 'Local time': 'Thu 2019-09-05 00:06:08 CST',
  'Universal time': 'Wed 2019-09-04 16:06:08 UTC',
  'RTC time': 'Wed 2019-09-04 16:06:09',
  'Time zone': 'Asia/Shanghai (CST, +0800)',
  'System clock synchronized': 'yes',
  'NTP service': 'active',
  'RTC in local TZ': 'no' }
```
```js
{ localTime: 'Wed 2019-09-04 23:59:54 CST',
  universalTime: 'Wed 2019-09-04 15:59:54 UTC',
  rtcTime: 'Wed 2019-09-04 15:59:55',
  timeZone: 'Asia/Shanghai (CST, +0800)',
  systemClockSynchronized: 'yes',
  ntpService: 'active',
  rtcInLocalTz: 'no' }
```



# 4. Responder

在实现上，`Channel`模块作为一个纯粹的message dispatcher实现；

`Channel`模块emit的message由各个责任模块自己侦听处理；其中负责向云返回mqtt或者http/pipe消息的模块称为responder。

responder目前只有pipe服务；message格式：

```
message {
  urlPath
  verb
  body
  params
  user
}
```

### PATCH /winasd

bodym = Object.assing({}, body, params)

ctx.PATCH

### (GET) /winasd/info 

+ verb not checked
+ ctx.view()

### (GET) /winasd/device

ctx.updateDeviceName(null, bodym.name)

### GET /winasd/upgrade

ctx.upgrade.LIST

# 主动上报mqtt

deviceName, IP, Link-local IP, Version (据说没有在用)