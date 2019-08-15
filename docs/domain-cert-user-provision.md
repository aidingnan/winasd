# Definitions

Domain是为User，Station和Client提供服务的云实例标识。

不同的Domain里有独立的：
1. 用户身份（User Account）
2. Station身份（Station Account以证书体现）

附属于User Account和Station Account资源容器内的云端资源，在不同的Domain内存在不同实例，互相之间无关。

目前系统支持两个Domain：`aws-cn`和`test`；业务上，前者是中国区用户的生产环境，后者是测试环境。

云上的Station Account，以证书的形式存在，使用aws iot的mqtt/https连接作为服务登录的Authentication机制。

绑定关系视为Domain内的User ID和Station ID之间的关系资源。

Provision是在云端为Station创建Station Account的过程，即创建证书。

# Station

在Station内，使用文件控制设备启动时所使用的Domain，如果文件不存在，文件类型或内容非法，缺省使用`aws-cn`。

目前代码中的目录和文件配置如下：

```
$ cat config/default.json 
{
  "type": "winas",
  "iot": {
    "endpoint": "a14xa979dh1dgw.ats.iot.cn-north-1.amazonaws.com.cn",
    "region": "cn-north-1"
  },
  "upgrade": {
    "version": "/etc/version"
  },
  "storage": {
    "roots": {
      "p": "/run/cowroot/root/data",
      "winas": "/root/winas",
      "tmp": "",
      "vols": "/run/cowroot/root/vols"
    },
    "dirs": {
      "certDir": "/run/cowroot/root/data/cache/certificate",
      "tmpDir": "/run/cowroot/root/data/cache/tmp",
      "isoDir": "/run/cowroot/root/data/cache/iso",
      "bleDir": "/run/cowroot/root/data/cache/ble",
      "winasDir": "/root/winas",
      "bound": "/run/cowroot/root/data/cache/bound",
      "device": "/run/cowroot/root/data/cache/device"
    },
    "files": {
      "csr": "device.csr",
      "cert": "device.cert",
      "caCert": "awsCA.pem",
      "provision": "provisioned",
      "boundUser": "boundUser.json",
      "deviceName": "deviceName",
      "lifecycle": "lifecycle",
      "deviceSN": "deviceSN"
    }
  },
  "provision": {
    "address": "http://10.10.9.122:8080"
  },
  "ecc": {
    "bus": 1
  },
  "led": {
    "bus": 1,
    "addr": 100
  },
  "system": {
    "globalNode": true,
    "withoutEcc": false
  },
  "pipe": {
    "baseURL": "https://aws-cn.aidingnan.com"
  },
  "cloud": {
    "addr": "https://aws-cn.aidingnan.com"
  }
}
```

其中dirs, files和pipe/cloud url的配置会有设计变化。设计要求需要满足这样一些约定：

1. 

```
<Volume Root>/data/domain
```

1. 证书文件和用户文件的路径约定应满足可以在Station上同时存在多个Domain的要求
2. 其中只有一个生效，且winasd知道自己的实际domain

```
# cert
<volume root>/data/cache/<domain>
```




