# 1. Components

本文档用于分析接口文档给出的外部行为约定，给出内部组件设计要求。

## 1.1. 问题

目前的代码实现了接口协议的绝大多数行为要求；主要的问题是模块化的粒度太粗，重点体现在主状态机的每个状态承担的责任太多。

比如，在`prerequisite`状态中访问的硬件和文件很多，没有更进一步的去问，**哪些资源应该是private的**。而在良好设计的组件模型中，**所有资源都应该是private**的，这样行为的依赖性才能一目了然。

在目前的设计中接口上出现了批处理式的业务逻辑，而相应的实现代码中出现了多步骤的操作和等待逻辑，但整个过程的依赖性没有清晰的表达为组件的依赖性，而是在过程代码中体现。这种代码难以测试，体现在**需要mock的外部依赖不清晰，构造一个最小化的可测试模块困难**。

## 1.2. 责任分析

在`prerequisite`中出现的`deviceCert`文件读取，实际上是channel模块内部需求，如果`channel`模块独立，该文件读取不该出现在全局的初始化之中，`channel`模块可以自己处理向云端索取证书的工作。

类似的，`user`文件也应该是一个负责维护user信息，包括本地cache的模块的内部资源，目前代码中缺乏这个模块，它的责任放在`app-service`中，相当于把这个资源全局化了。

这里我们还发现存在一个设计错误。在设计定义中，仅在`deviceCert`文件不存在时，`user`文件不存在被理解为绑定状态未知。而从资源角度看，`devicerCert`文件是否存在与`user`文件是否存在无关，如果`user`责任封装到独立模块中，它需要向`channel`模块询问是否有`deviceCert`再决定自己是无法确定绑定状态还是未绑定状态，语义上是不合理的。

修正的方法是：负责`user`的模块，在未绑定状态下仍然应该用`null`持久化存储，表示设备的未绑定状态；这样可以区分未绑定还是绑定状态未本地存储两种状态。

### 1.2.1. Prerequisite

在当前的系统初始化时有8个异步并发操作：

1. 初始化ecc
2. 初始化led
3. 检查和载入user
4. 检查和载入device cert
5. 载入sn
6. 载入usn
7. 载入hostname
8. 写入ca列表

其中4/8应并入channel，3并入负责user的模块，ecc是系统启动前置条件，led初始化应该是led模块内部的事情；其他信息载入和准备目录可并发，所以初始化过程原则上只有一个target即可，而且该过程没有重入要求，无需单独建立状态；但达到这种状态需要每个模块单独重构完成。

### 1.2.2. Channel责任

实际上在每个状态下重建Channel的必要性是没有的。

Channel模块的核心责任是：

1. 自己维护证书
2. 可以blind polling，也可以侦听网络状态，决定是否建立通讯；
3. 分发Channel通讯，如果有数据需要缓冲，责任可以不在Channel模块，由侦听者自己缓冲；包括分发给winas的信息；
4. 通过Channel发送信息，在无连接时允许Channel直接返回错误；
5. 允许外部要求Channel重建连接，以触发获取云端更新的device和user信息；

需要Channel信息的详细定义，以决定外部可以subscribe/on channel的那些类型消息；

### 1.2.3. Owner责任

目前主要的设计缺失在Owner模块上；Owner模块的责任主要是体现两个设计：

1. 设备的绑定信息是云资源，设备只是缓冲；
2. 变更该云资源需要station参与，提供proof-of-contact；

Owner模块应该：

1. 侦听Channel提供的与用户相关的信息; 
2. 维护本地文件cache；
3. 向其他模块提供绑定和owner信息；
4. 提供绑定解绑过程中与云操作业务有关的部分逻辑；但不包括格式化磁盘之类的业务，这个业务和云资源无关；

现有Lifecycle部分代码可以直接并入`Owner`模块，这是核心业务，而且这样剥离后Owner的责任很少，代码量不多。

### 1.2.4. Device责任

Device模块负责维护和Device信息相关的部分，例如display name，root与否等等；如果现有的Channel协议没有明确分开消息类型，可以和Owner模块共同侦听同样的消息，但只处理自己感兴趣的部分；

### 1.2.5. Winas责任

winas模块侦听Owner即可确定是否该启动/停止winas服务，同时它还可以为winas cache一些云端请求，如果winas处于重启过程中；

## 1.3. TODO

1, 给出Channel所有可以on的消息类型和数据格式定义，补充到本文档中
2, 给出绑定时需要向云发出的http请求的api语义定义，补充到interfaces.md文档中（依赖的接口）。

# 2. 详细设计

## 2.1. Channel

Channel的责任是维护与aws iot的mqtt连接。

外部依赖：

1. aws iot的mqtt
2. 对网络状态的检查（暂时不做）
3. 对ntp对时的检查
    - `timedatectl timesync-status`可polling ntp状态
    - `timedatectl timesync-status --monitor`可侦听ntp状态

内部责任与资源：

1. CA写入文件系统
2. 如果没有证书自己去取
3. 定时更新token

外部责任：

1. 分发消息，如果消息为混杂消息，应该分开emit；
2. 提供一个reconnect方法；（考虑到目前绑定解绑业务时有断连重连的设计）；
3. 提供send方法供外部模块发送mqtt消息；
4. 有一个连接状态
5. 增加一个设备证书状态（none, offline, online），这个不急着实现；
    - none是无证书
    - offline是有离线证书
    - online是证书在线检查过

未知问题：

Channel简单使用on方法可能会在mqtt协议增加的时候出现扩展困难；到时候再考虑把subscribe mqtt endpoints的能力暴露出去，暂时用简单办法hardcode消息类型；

## 2.2. Bled

Bled通过ble的advertisement和gatt服务提供客户端服务。

外部依赖：

1. dbus
2. LocalAuth服务；

内部责任与资源：

1. ble为无态模块
2. ble静态定义部分advertisement内容和全部gatt服务类型（characteristics）

外部责任：

1. 每个gatt服务需要提供一个nodecallback形式的handler；
2. 提供注册方法

初始化：

1. 初始化的localname使用hostname，来自全局配置；
2. 初始化的bound和sata状态使用0x00；
    - 更新sata的责任是初始化部分代码，在发生格式化之后要更新；
    - 更新bound的责任是owner模块；

在没有handler的情况下，来自客户端的服务返回EUnavailable。

设计：

bled比较难设计成express的模式，主要原因有二：

1. connected和disconnected事件对localauth有影响；
2. 存在需要emit progress的服务，这种服务需要把output抽象成stream才行，不是callback形式函数能解决的；

所以直接采用emitter方式来设计bled行为

1. emit attached事件，表示info可用；目前没什么用；
2. emit connected和disconnected事件；提供connected属性（true/false）；
3. emit message事件，数据中提供service uuid；所有handler可以on到这一个事件上，自己通过service uuid和action区分；
4. 提供send方法用于发送消息；
5. 暂不清楚对于authorizing状态是否要特殊处理，例如block所有其他访问；
6. 提供一个可注册的authorizer，authorizer是一个同步函数，返回true/fase，除了local auth服务之外均使用该api先检查授权；

该设计导致初始化时，ble是所有其他业务服务的依赖性。

内部资源和状态一览：

- dbus
- ble模块
- adv的三个字段，name, sata, bound
- authorizer，如果无authorizer除了local auth其他服务不可用

状态：

1. dbus错误，无法连接，模块不可用
2. dbus上注册ble服务错误，模块不可用

阻塞：

1. 无阻塞，对adv的更新如果发生在attached事件之前，直接更新内部状态，在attached的时候会更新adv。

## 2.3. ECC

+ 内置了init代码，利用队列阻塞
+ 如果初始化错误会emit error
+ 初始化成功会emit ready

新的文件是`lib/atecc/atecc`；

内部有error和ecc两个成员，如果均为null，说明初始化未完成；在初始化成功时会设置ecc成员，在初始化失败时会设置error成员；但外部模块无需去检查内部状态，可以直接调用接口方法，如果初始化失败会返回错误，error code设置为`EUNAVAIL`。

## 2.4. Sata

sata作为独立模块，承担检查sata状态（status）和格式化两个责任。

sata提供可外部访问的成员`status`，值的范围除了0x02, 0x03, 0x04, 0x80等spec定义的状态值之外，还有：
- 0x00，表示首次检测未完成；
- 0xff，表示最近一次检测未能成功遇到意外操作错误；

sata继承EventEmitter，在每次更新status的时候emit `statusUpdate`事件和最新的status值，但不保证status值一定变化。

format方法仅在0x03, 0x04和0x80状态下可用，如果是0x80，format会检查sda是否已经mount并尝试unmount，在其他两个状态下不会做此检查；format失败会返回错误；无论format成功与否均会重新检查sata状态。

外部依赖模块只需要观察sata状态的，可以先检查status，如果status不满足要求，可以侦听statusUpdate；业务上，status不走循环，目标是走向0x80，抵达0x80之后依赖模块即可工作。

目前winas服务和sata format的互斥代码层面没有表述，只有服务实现的时候先关闭winas（通过迁移owner到unbound，而不是直接操作winas）。

## Ownership

Ownership模块的责任是向其他模块提供owner信息，该需求可以通过emit `owner`事件实现。

Ownership模块的源有两个，一个是cached owner，从文件系统读取，另一个是channel，channel提供`device`消息；

原有代码根据owner的状态建立了状态机，这个做法值得商榷；一般而言状态机很少是外部资源直接决定的，比如parser是根据缓冲状态决定的；在这个例子里，来自channel的信息对Owner模块的状态有绝对的决定权（如果有效的话）。

资源设计的核心是要区分cached owner和真正的owner（来自云的信息）。如果两者分开就不会有设计上的困惑。其中cached owner可以通过一个独立模块完成。它只在载入时发出一次`load`消息，提供cache的`owner`，之后就只有写入操作。

bind/unbind在仅有cached owner时不可用，需求要求绑定操作仅可在在线时发生。

bind/unbind操作仅可触发一个实例，如果有一个正在执行并未完成，后续请求失败（FORBIDDEN）。

业务上，bind/unbind事实上是在**参与**修改云端资源，而非修改本地资源；其数据流模型类似于React的单向数据流的说法，即绑定与解绑操作的终点，是云端下发新的`owner`信息，而不是向云端的请求结束。向云请求bind/unbind操作的rest api过程应看作云更新资源的第一步，成功之后还需要等待到云通过channel下发新owner信息，才算过程完成，第二步中可能需要触发一次channel的重新连接。

粗粒度上看，虽然绑定解绑过程通讯和操作复杂，但是和异步更新一个bool值没有区别。

这个模型有两个问题：

1. 在第一步中如果云端行为异常，直接下发Owner信息，如果信息是期望的结果，应视作操作成功；如果未来更新云端设计在restful api请求时直接下发Owner更新，这就是可能发生的正常情况；
2. 在第二步中如果通讯中断；根据restful api设计来说，此时应该可以视作成功，等到channel下发新的消息时，应视作幂等更新。

换句话说，在bind/unbind请求时：request的response和channel两个源的信息是race的；其幂等性应该是云端的承诺。可靠的实现是在请求发出后：

1. 任何一方返回了期望的结果都视作操作完成；
2. 错误则发生在request返回错误或通讯中断时；

综上，根据云绑定信息建立状态机的必要性不存在，（但可以根据操作步骤建立状态机）；但是操作的：

1. 适用条件
2. 仅允许单发
3. 期盼状态和双信息源race

是需要仔细考虑如何实现的。

防御性：

从以上分析上看，云如果连续下发不一致的owner信息，视作云的错误；逻辑上等同于，只有在station期望发生某种改变的时候，才允许出现期望的改变（restful api成功），或者不改变（restful api失败）。











