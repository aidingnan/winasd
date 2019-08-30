aw2015的Pattern模式的逻辑；


先通过ILED1_y等寄存器设置4种真彩色；

然后最多可以设定3种Pattern，每个Pattern里都有对四种真彩色的使能；这样可以让任何一种真彩色实现某个Pattern。目前未知是否可以在同一Pattern中直接混合真彩色。

Addr|Name|Func|Default|Usage
-|-|-|-|-
0x00|RSTIDR|ro, 读取芯片ID，写入0x55可reset芯片|0x31|重置芯片
0x01|GCR|PWM基频，充电检测，使能|0x00|???
0x02|STATUS|状态||
0x03|IMAX|最大电流|01b/6.375mA
0x04~0x06|LCFG[1-3]|FADE IN, FADE OUT, MODE|0x01(LCFG1)，LED1 PATTERN模式|设置Pattern/Manual模式
0x07|LEDEN|LED使能|LED1使能|均使能
0x08|LEDCTR|SYNC/PWMLOG|0x00(Log60)|???
0x09|PATRUN|Pattern Run/Stop控制|0x00???
0x10~0x1B|ILED[1-3]_[1-4]|定义四种真彩色
0x1C~0x1E|PWM[1-3]|设置每个LED的Duty Cycle，相当于调整相对亮度
0x30/0x35/0x3A|PATTERN定义

初试设置，理解为Color1定义为LED1 FF, LED2 00, LED3 00

- ILED1_1 0xFF, ILED1_2/3/4 0x00
- ILED2_1/2/3/4 0xFF
- ILED3_1/2/3/4 0xFF



四色定义：

红，绿，蓝，白

LED1_1 0xFF
LED2_1 0x00
LED3_1 0x00

LED1_2 0x00
LED2_2 0xFF
LED3_2 0x00

LED1_3 0x00
LED2_3 0x00
LED3_3 0xFF

- LED1_4 0xFF
- LED2_4 0xFF
- LED3_4 0xFF


Name|Comment|常亮|闪烁|呼吸|default
-|-|-|-|-|-
TRISE|上升时间|0000|||0x8 (2.1s)
TON|ON时间|1111（8.3s）|||0x0
TFALL|下降时间|0000|||0x8(2.1s)
TOFF|OFF时间||||0x6 (1.04s)
TSLOT|多脉冲模式的间隔
TDELAY|模式启动延迟
PATCTR|永久或指定次数
PATSW|switch or not|不使用|不使用|不是用
MPULSE|1/2/3/4次pulse
CE4|
CE3|
CE2|
CE1|
REPTIM|???


缺省配置

PAT1_T1 这个相当于是呼吸配置

- TRISE/TON 0x80
- TFALL/TOFF 0x86
- TSLOT/TDELAY 0x00
- PAT_CTR/PAT_SW/MPULSE/CE4/CE3/CE2/CE1 0x00

1. pattern fun forever
2. pattern switch disabled
3. single pulse
4. CEx = 0，如果所有CE都mask了，显示Color #1，及等于CE1 = 1

应该可以通过修改时间就变成闪烁配置，不清楚能不能通过消灭rise/fall/off变成常亮，may be


