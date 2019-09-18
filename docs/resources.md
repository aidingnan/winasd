# 资源容器

## 设备

winasd的顶层资源容器是device，提供的是全局的静态资源，包括：

1. sn
2. usn
3. version（使用`/etc/version`的完整内容）
4. hostname，使用系统的hostname，即os.hostname()
5. model

顶层资源容器中的内容都与设备相关，包括硬件型号和软件版本；winasd程序不假定了解这些信息的设计规则；

除了提供设备信息之外，device提供shutdown和reboot方法；且shutdown和reboot方法提供广播，所有服务如果有cleanup工作可侦听该事件；

## 用户（ownership）

以下资源为用户资源：

1. 用户（包括owner和users）文件的持久化；
2. 设备的display name；
3. networkmanager的配置文件；
4. root

注意2/3/4的状态生命周期定义都隶属owner。

ownership模块提供root和unroot的方法。

## Channel

Channel自己维护通讯所需的CA证书、设备证书；



