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
- 0x01，
- 0x02，
- 0x03，winasd无法确定绑定状态，最常见的原因是设备刷机之后丢失用户文件且无法联网获取。

# 3. Http接口

TBD

# 4. Channel接口

TBD