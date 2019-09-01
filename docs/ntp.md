# NTP问题

在系统启动第一次联网之后需要NTP对时。

以下测试在engineering模式下完成。系统启动后无wifi配置。

使用两个ssh窗口，第一个启动如下命令：

```
$ timedatectl timesync-status --monitor
```

该命令会观察ntp服务通讯和状态，初始状态如下：

```
       Server: (null) (3.debian.pool.ntp.org)
Poll interval: 0 (min: 32s; max 34min 8s)
 Packet count: 0
```

第二个ssh窗口启动nmcli命令连接wifi；在wifi连接后可以观察到ntp对时成功。

```
       Server: 94.130.49.186 (0.debian.pool.ntp.org)
Poll interval: 32s (min: 32s; max 34min 8s)
         Leap: normal
      Version: 4
      Stratum: 3
    Reference: C30D1705
    Precision: 1us (-26)
Root distance: 10.215ms (max: 5s)
       Offset: +6month 2w 8h 36min 32.899708s
        Delay: 230.876ms
       Jitter: 0
 Packet count: 1
    Frequency: +0.000ppm
```

延迟时间不稳定；有时很短，在1s左右，有时很长，需10s钟以上。

初步判断和dns有关。解析0.debian.pool.ntp.org需要较长时间。

## 结论

1. 暂时不需要手动触发ntp服务，可确定systemd-timesyncd是联网之后立刻出发ntp请求的；
2. `timedatectl timesync-status`命令可用于检查状态，也可以用`--monitor`作为事件源更新全局变量；
3. 显著改善性能的是使用国内的ntp server，如果能直接使用ip地址更好，可省去dns查询问题；
4. 可使用多个ntp源；