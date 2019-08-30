# 本文档定义spec文档中sata一节中定义的winasd行为的测试

## Group 1

Group1测试在不同sata状态下，ble的manufacturer的服务完整，adv中sata状态正确。

所有测试在engineering状态下进行，检测ble adv的工具使用bluetoothctl（推荐），或者lightblue。

### sata-g1-02

1. 不插入ssd
2. 启动winasd
3. 在bluetoothctl中使用info命令查看设备，sata字段为02

### sata-g1-03

1. 插入dos分区，格式化成ntfs的ssd
2. 启动winasd
3. 在bluetoothctl中使用info命令查看设备，sata字段为03

### sata-g1-04

ssd准备，在Linux PC上使用ssd和其他物理介质或分区，创建一个btrfs raid1卷；然后单独拿出ssd，模拟一个坏掉的btrfs卷。

1. 插入所述ssd
2. 启动winasd
3. 在bluetoothctl中使用info命令查看设备，sata字段为04

### sata-g1-80


1. 插入正确格式化为btrfs的ssd
2. 启动winasd
3. 在bluetoothctl中使用info命令查看设备，sata字段为0x80

在以上情况下，均允许在winasd启动开始时读到0x00，但最终应该读取正确。

## Group 2

通过蓝牙的格式化命令格式化磁盘；该操作不易手工完成，因为前面需要先获取token；拟通过Labtool自动或者半自动测试；

### sata-g2-00

该测试发生于瞬态，不做强制要求；

该状态下格式化返回错误；Forbidden

### sata-g2-02

该状态下格式化返回错误；Forbidden

### sata-g2-03

该状态下允许格式化，可返回成功或错误；

### sata-g2-04

该状态下允许格式化，可返回成功或错误；

### sata-g2-80

一切正常时winasd会启动；

该状态下格式化返回错误；Forbidden




