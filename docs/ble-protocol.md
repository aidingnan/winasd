**COPYRIGHT**

本文档为商业文档；版权归上海钉南智能科技有限公司所有；未经书面许可不许商业使用和分发。

----

# 1. BLE Protocol

本文档描述Bluetooth LE (BLE)的接口协议；包括蓝牙广播和Gatt服务两部分。

文档中使用设备或device指口袋网盘设备；使用主机或host指Linux主机。

文档维护：lewis.ma@aidingnan.com (or matianfu@gmail.com, matianfu)


# 2. 检查和调试BLE使用的Linux命令

在Linux下可以使用`hciconfig`，`hcitool`和`bluetoothctl`等命令检查蓝牙设备状态。

在设备上查看蓝牙地址和设备能力可以使用`hciconfig`；

```
root@pan-8785:~# hciconfig -a
hci0:	Type: Primary  Bus: UART
	BD Address: CC:4B:73:3D:0C:31  ACL MTU: 1021:8  SCO MTU: 64:1
	UP RUNNING 
	RX bytes:5875 acl:55 sco:0 events:464 errors:0
	TX bytes:62897 acl:53 sco:0 commands:417 errors:0
	Features: 0xbf 0xfe 0xcf 0xfe 0xdb 0xff 0x7b 0x87
	Packet type: DM1 DM3 DM5 DH1 DH3 DH5 HV1 HV2 HV3 
	Link policy: RSWITCH SNIFF 
	Link mode: SLAVE ACCEPT 
	Name: 'pan-8785'
	Class: 0x000000
	Service Classes: Unspecified
	Device Class: Miscellaneous, 
	HCI Version: 4.2 (0x8)  Revision: 0x118
	LMP Version: 4.2 (0x8)  Subversion: 0x6119
	Manufacturer: Broadcom Corporation (15)
```

在host上可以使用`hcitool lescan`命令简单搜索LE设备，`hcitool`也可以直接发送数据包和控制BLE设备状态，通过直接写入二进制数据的方式。本文档不做介绍。

## 2.1. bluetoothctl

`bluetoothctl`是开发和调试的主要手段，该命令本身实现了一个REPL界面，不太适合使用脚本控制。

在host的蓝牙协议栈里会cache发现或连接过的设备信息，使得一些信息无法及时更新，而且`devices`命令可能找不到设备。在`scan`之前，需要通过下列命令组合进入`scan`菜单清除filter，然后回到主菜单执行命令。 

```
menu scan   # 进入scan菜单
clear       # 清除filter
back        # 回到主菜单
```

在主菜单可以执行`scan on`和`scan off`开始和停止搜索。

在主菜单下：

+ `devices`列出搜索到的蓝牙设备；
+ `info 蓝牙设备地址`可以查看设备信息，包括服务和广播数据；
+ `connect 蓝牙设备地址`可以连接设备；

访问gatt服务需要通过`menu gatt`进入gatt菜单；在gatt菜单下：

+ `list-attributes`可以列出已连接设备的所有gatt service和characteristics；注意每个characteristic分配了一个dbus的路径；
+ `select-attribute characteristic的dbus路径`可以选定一个characteristic；
+ `write`和`read`命令可以读写当前选定的characteristic；
+ 可以使用`notify on`命令打开notification，如果相应的characteristic支持的话；

`bluetoothctl`可以同时打开多个运行实例，本质上它们都通过bluez的dbus API访问bluetoothd服务。在执行读写的时候可以用两个console分别选择characteristic观察写入后的notification。

# 3. Advertisement

`scan`之后使用`info`命令查看设备信息可以看到`Name`和`Manufacturer Data`；

```
[bluetooth]# info CC:4B:73:3D:0C:31
Device CC:4B:73:3D:0C:31 (public)
	Name: pan-8785
	Alias: pan-8785
	Paired: no
	Trusted: no
	Blocked: no
	Connected: no
	LegacyPairing: no
	UUID: Generic Access Profile    (00001800-0000-1000-8000-00805f9b34fb)
	UUID: Generic Attribute Profile (00001801-0000-1000-8000-00805f9b34fb)
	ManufacturerData Key: 0xffff
	ManufacturerData Value:
  02 80                                            ..
[bluetooth]# 
```

Name的格式为`pan-NNNN`，其中`NNNN`为设备的USN头部的四位数字短码。

Manufacturer Data为二进制数据，目前仅定义了两个字节，但客户端应该不对Manufacturer Data的长度做限制，以方便未来设备端固件功能升级。

第一个字节用于描述设备的用户绑定状态，第二个字节用于描述设备的磁盘状态，具体定义参见spec文档。

# 4. Gatt服务

## 4.1. Overview

目前实际使用的服务有两个，分别为Local Auth服务和Action服务。两者的Characteristic设计方式一致，均提供两个Characteristic，其中一个具有write/read能力，用于写入数据；另一个具有read/notify能力，用于读取结果。

所有数据类型均为JSON格式且为non-null object。

## 4.2. Local Auth

Local Auth的业务目的是给客户端提供一个可以访问Action服务的Token；请求Local Auth后设备会以out-of-band方式challenge用户可以近距离接触设备；目前的口袋网盘设备是要求客户端提供设备的指示灯颜色与闪烁状态，在项目中称为color code。

### 4.2.1. Gatt Service and Characteristics

+ service UUID: `60000000-0182-406c-9221-0a6680bd0943`
+ read (notify) characteristic UUID: `60000002-0182-406c-9221-0a6680bd0943`
+ write (read) characteristic UUID: `60000003-0182-406c-9221-0a6680bd0943`

### 4.2.2. 流程

1. 客户端发起auth请求
2. 设备应答challenge (color code choices)
3. 客户端显示challenge，让用户识别和选择LED的颜色和状态
4. 客户端提供challenge-response
5. 如果结果正确，设备向客户端返回具有时效性的token

其中3为人为操作，通讯为连续两次请求和应答。

### 4.2.3. request auth / challenge

步骤1中客户端发起的请求格式：

```json
{
    "seq": 123,
    "action": "req"
}
```

步骤2成功时返回的challenge，成功时返回的对象无`error`属性。

```json
{
    "seq": 123,
    "data": {
        "colors": [ ["#ff0000", "alwaysOn" ], ...]
    }
}
```

步骤2失败时返回的错误。

```json
{
    "seq": 123,
    "error": {
        "code": "ERROR CODE" 
    }
}
```

提供两种错误代码：

- `ELED`（deprecated，将移除，代以`EINTERNAL`）
- `EBUSY`，已经有一个auth操作正在进行尚未完成

### 4.2.4. challenge response / token

步骤4中客户端提供challenge response：

```json
{
    "seq": 234,
    "action": "auth",
    "data": {
        "color": ["#ffffff", "alwaysOn"]
    }
}
```

步骤5成功时设备返回信息

```json
{
    "seq": 234,
    "data": {
        "token": "some encrypted secret"
    }
}
```

步骤5失败时返回信息格式同前，错误代码包括：

- `ESTATE`，状态错误，例如color code challenge已经超时结束；
- `ECOLOR`，用户选择的颜色代码错误；

## 4.3. Actions

Actions服务提供了几种用户业务操作，包括：

+ 配置wifi
+ 配置wifi并绑定用户
+ 格式化磁盘

Actions服务的所有请求要求客户端提供在Local Auth服务中申请的token。

### 4.3.1. Gatt Service and Characteristics

+ service UUID: `70000000-0182-406c-9221-0a6680bd0943`
+ read (notify) characteristic UUID: `70000002-0182-406c-9221-0a6680bd0943`
+ write (read) characteristic UUID: `70000003-0182-406c-9221-0a6680bd0943`

### 4.3.2. 配置wifi

请求格式：

```json
{
    "seq": 123,
    "token": "xxxxxx",
    "action": "addAndActive",
    "body": {
        "ssid": "ssid",
        "pwd": "password"
    }
}
```

成功时返回设备的IP地址（IPv4），目前提供`prefix`属性表示子网掩码，不建议客户端使用。

```json
{
    "seq": 123,
    "data": {
        address: "10.10.10.10"
        prefix: 24
    }
}
```

 - `data.prefix` (deprecated)

失败时的返回

```json
{
    "seq": 123,
    "error": {
        "message": "error message",
        "code": "error code",
        "reason": "reason code",
        "bssid": "bssid",
        "status": "status code"
    }
}
```

其中`code`对所有返回均适用；`message`仅用于debug问题，除显示目的外客户端不应解析其中数据；其他属性为可选，视`code`和`reason`而定。

目前该接口的错误返回仅返回`EWIFI`作为error code，且保证code为`EWIFI`时，提供reason，包括如下情况：

- `EINTERNAL`，在设备调用Linux命令搜索和连接wifi时遇到的错误，不是指命令程序返回错误，而是程序遇到了异常情况，例如命令不存在、启动失败、或者被Kill；
- `ENOTFOUND`，搜索wifi失败，无法找到给定ssid名称的access point；
- `EASSOCREJ`，该错误是内核的wifi驱动和cfg80211框架抛出的，指wifi连接的第一个阶段association失败；该错误时，额外提供`status`信息，status的类型为整数；
    - status=16且bssid="00:00:00:00:00:00"时，可判定为不兼容；
    - 其他status code参见 https://blogs.arubanetworks.com/industries/802-11-reason-codes-and-status-codes/
    - 初上述情况外其他status code客户端可以不解析，统一表示为与路由器wifi握手失败；但应提供显示`status`和`bssid`（不保证有）的界面，便于分析问题；
    - 真正的密码错误对应的status待试验；但密码错误首先遇到的肯定是`EASSOCREJ`错误原因；
- `EFAIL`，其他原因导致的`nmcli`返回失败；通常为wifi握手成功但无法获取ip地址等；


上述错误类型中，`EINTERNAL`通常可以重试或者重启后重试成功，如果无法消除则确认为内部程序的严重bug；`EFAIL`将逐步细化，增加新的错误类型缩小`EFAIL`的范畴；客户端的向后兼容可以在code为`EWIFI`时，遇到未知的错误代码，统统当作为`EFAIL`处理。

### 4.3.3. 配置wifi且绑定用户

请求格式：

```json
{
    "seq": 123,
    "token": "xxxxxx",
    "action": "addAndActiveAndBound",
    "body": {
        "ssid": "ssid",
        "pwd": "password",
        "encrypted": "向云申请的客户身份证明"
    }
}
```

该接口的返回使用流式返回；如果遇到错误则返回一个错误格式的对象且不再发送数据；如果正确则一直发布进度直到最后一个进度发送完成，不再发送数据。

正确的进度为：

```json
{ 
    "success": "WIFI" 
},
{   
    "success": "CHANNEL" 
},
{ 
    "success": "BOUND",
    "data": {
        "sn": "0123xxxxxxxxxxxxee",
        "addr": "10.10.10.10"
    } 
}
```

第一阶段表示wifi连接成功；第二阶段表示连接到云成功且已经获得设备的用户信息（包括设备已经被绑定的情况）；第三阶段表示向云请求绑定成功，但不包括等待云下发新的设备用户信息到设备，即返回。

以下列表表示进度消息和错误消息发生的顺序：

1. 执行连接wifi动作
    - 如果错误，返回`EWIFI`，和配置wifi一节定义的所有其他错误信息一致，内部重用代码；
    - 如果成功，发送进度success `WIFI`；
2. 等待云下发设备的owner信息，或60秒超时
    - 如果超时，返回`ETIMEOUT`，同时提供如下`reason`:
        + `EUNHEALTHY`，系统的网络和服务诊断模块判定系统未能达到设备所需的健康状态：
            * 此时提供`watson`对象属性，是系统网络状态的整体描述；
        + `ECHANNEL`，系统的网络和服务诊断是健康的，但是未能和云建立channel通讯；
            * 此时提供`channel`属性，是channel模块的状态；
            * 状态包括Connected, Connecting等，客户端只需要显示不需要解析；
        + `EUNKNOWN`，系统的网络和服务诊断是健康的，channel也处于connected状态；要么软件内部有bug，要么云未能正确工作；可重试；
    - 如果成功，但设备已经绑定，返回`EEXIST`；
    - 如果成功且设备未绑定，发送进度success `CHANNEL`；
3. 向云请求绑定用户；
    - 如果失败，返回`EBOUND`作为错误代码，原错误代码（可能来自本地网络连接也可能来自云被设置为`reason`，客户端不需要解析`reason`，但应该提供显示能力，包括`message`；
    - 如果成功，最终返回success `BOUND`；


### 4.3.4. watson

watson的数据格式如下：

```json
{ 
    "wlan0": "connected",
    "conn": "Xiaomi_123_5G",
    "ip": "10.10.9.75/24",
    "gw": "10.10.9.1:1",
    "dns1": "202.96.209.133:1",
    "dns2": "202.96.209.5:1",
    "ep": 1,
    "ec": 1,
    "ts": 1
}
```

- `wlan0`，字串，wifi的状态，包括： 
    + `unavailable`，驱动或硬件错误，系统中无wlan0；
    + `off`，无线关闭，目前业务中没有这种使用情形；
    + `disconnected`，未连接；
    + `connecting`，正在连接；
    + `connected`，已经连接；
    + `deactivating`，通常发生在切换时先断开已有连接；
    + 以上状态名称由NetworkManager定义；
    + 对客户端有意义的只有`connected`状态，大部分其他属性尽在`connected`状态才有；
+ `conn`，NetworkManager的monitor输出的connection名称，在绝大多数情况下都是ssid，但不保证这一点，也可能是ssid加了数字或随机数后缀；
+ `ip`，ip地址和子网掩码（cidr格式）；
+ `gw`，gateway的ip地址和ping状态；
+ `dns1`, `dns2`，dns服务器的ip地址和ping状态；
+ `ep`，iot的endpoint服务器地址的ping状态；
+ `ec`，ec服务器地址（即aws-cn.aidingnan.com）的ping状态；
+ `ts`，ntp对时是否完成；

`ip`, `gw`, `dns1`, `dns2`都使用了`${ipAddress}:${n}`的格式，其中n为`1`或`0`；1表示可ping通，0表示不可ping通；`ep`和`ec`则仅提供是否可以ping通，两者的ip地址都是高度动态的，提供给客户端无意义；

客户端应首先检查`wlan0`状态为`connected`；其次`ip`要有，然后才可能有`ep`, `ec`等；

dns服务器不可能为`127.0.0.1`或`127.0.1.1`的设备本机地址，已经被过滤掉；但可能为路由器地址；如果dns为路由器地址，即使dns能ping通也不确定是否可以连接Internet；但如果dns地址不在ip的子网掩码内，通常可判断为可连接Internet，除非在企业网络内配置了专门的DNS服务器。 

watson模块的`healthy`定义为：

1. gw, dns, ep, ec全部都可以ping通；如果有多个dns，则有至少一个可ping通即可；
2. ts为1;

未来会提供一个单独的BLE服务读取watson，帮助分析网络问题；在内部watson一直检测这些设备、配置和远程主机的变化，其healthy状态是动态变化的。

