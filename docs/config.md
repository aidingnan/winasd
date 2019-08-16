修改前的准备，目前版本的default配置如下：

```json
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

第一级配置中，type, iot, upgrade, ecc, led, system与domain/文件路径修改无关。

pipe和cloud里的两个url有关。

system.globalNode是一个全局配置，与domain和文件路径均无关；

system.withoutEcc是一个全局配置，影响的系统行为包括：
- 使用ec serial还是deviceSN文件作为station ID
- 使用ec及ec证书，还是密钥文件+证书，作为iot authentication
- 原则上每domain要有自己的ca证书，目前的domain证书都是aws颁发的，只用一个awsCA即可。
- channel的行为
- 当前初始化时的目录准备和模块启动

在domain和文件路径方面，不管使用ec还是密钥，station的云端帐号都是

## Storage部分
```
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
```

`roots.p`

1. provision在使用，暂不fix
2. app service初始化中需要data/init目录的地方在用该参数拼凑路径，应建立initDir

`roots.winas`, `roots.tmp`

未发现代码使用

`roots.vols`

升级业务在使用，包括：
- `lib/donwload.js`
- `services/upgrade.js`

证书相关

已有代码的设计假设是：

- 程序不显式知道domain，程序使用的文件路径不体现domain
- 无论是否使用ec，cert和ca文件的路径一一致，不使用ec时使用文件标识的deviceSN和key，意味着：
    + 如果两种情况在同一设备上可以共存，但ID不同，意味着至少需要用symlink分开，而不是互相覆盖
    + 如果支持共存，意味着同一个设备即使对于同一个domain也允许有多个身份（0..1硬，0..N软）
    + 对于云来说其实区分不出来一个设备有多重身份，它只看ID和证书对

目前代码路径组合是

- files.csr, .cert, .caCert放在dirs.cert下面
- files.boundUser放在dirs.bound下面
- files.provision不再使用
- files.lifecycle有声明但未使用（修改了ec counter）
- files.deviceName是用户定义的设备显示名称，位于dirs.device下
- files.deviceSN仅在使用软身份时使用，位于dirs.device下

除了所列文件所在目录外：

- dirs.tmpDir全局使用
- dirs.isoDir升级功能使用
- dirs.bleDir未找到任何地方使用
- dirs.winasDir是winas程序运行的dir

## 分析

和路径相关的概念有这样几类：

第一类是程序的配置，体现了程序设计的灵活性或者和系统之前其他程序的相关性；例如winasDir，这类路径的容器和责任都隶属于rootfs，可以由程序配置文件或者rootfs内文件定义。最佳实践是rootfs内定义override程序自己的配置文件。

第二类是在卷的范围内的，包括设备的init信息，vols目录，tmpDir，isoDir等；

第三类是和域相关的，生命周期超过rootfs，所以也放在卷内。包括（软）身份和证书；

## 设计与变更

设计原则：

1. 从winasd的角度看volume提供的layout，包括init的信息哪里取，vols目录规则，但是winasd不需要了解volroot/data下的完整layout
  - initDir位置，包含sn等信息，目前这个目录仅仅考虑了有ec硬件的backus；如果是x86，需要重新考虑设计；
  - tmpDir位置，表示volume内的tmpDir，该目录在设备启动是会清空，程序或程序逻辑之间要避免冲突应该在该目录下继续建立子目录使用，原则上程序除了首次启动之外不该清空该目录；
  - volDir位置，是所有卷的位置，包括用UUID预定义的临时卷；
2. 云服务用domain划分，domain内的每个帐号标识都是容器，cert，boundUser, displayName都是这个容器内资源，生命周期不超过容器；
3. winasd在一次启动时只有一个角色，不支持角色切换；该唯一性由(domain,id)决定；
4. ca证书位于(domain,id)容器内，ca证书不可外部提取，ca证书可重用，至少目前ca证书只有一个，暂不考虑revocation业务。

### Layout

```
data/
  init/ ->              # initDir （symlink）
  tmp/                  # tmpDir
  cloud/                # cloudDir
    aws-cn/    
      <id>/             # 例如ec serial   
        device.crt      # 证书
        device.csr      # CSR（无用）
        device.key      # device key
        ca.crt          # 启动时写入
        boundUser.json  # 绑定用户信息
        display-name    # deviceName
    test/
      <id>/
        cert.pem
        ...
vols/             # volDir
```

domain, id, 和ca放在config文件中，id允许为空，为空时id就是ec serial，或者其他唯一硬件序列号；如果不为空就是某个云domain发的，该设计结合上面的layout允许云发任意数量软身份，但如果发硬身份就只能有一个；

```json

{
  "volume": {
    "vols": "/run/cowroot/root/vols",
    "init": "/run/cowroot/root/data/init",
    "tmp": "/run/cowroot/root/data/winasd/tmp",
    "cloud": "/run/cowroot/root/data/winasd/cloud"
  },  
  "cloud": {
    "domain": "aws-cn",
    "addr": "https://aws-cn.aidingnan.com",
    "id": "", 
    "caIndex": 0,
    "caList": [
"-----BEGIN CERTIFICATE-----\nMIIBtjCCAVugAwIBAgITBmyf1XSXNmY/Owua2eiedgPySjAKBggqhkjOPQQDAjA5\nMQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6b24g\nUm9vdCBDQSAzMB4XDTE1MDUyNjAwMDAwMFoXDTQwMDUyNjAwMDAwMFowOTELMAkG\nA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJvb3Qg\nQ0EgMzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABCmXp8ZBf8ANm+gBG1bG8lKl\nui2yEujSLtf6ycXYqm0fc4E7O5hrOXwzpcVOho6AF2hiRVd9RFgdszflZwjrZt6j\nQjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQWBBSr\nttvXBp43rDCGB5Fwx5zEGbF4wDAKBggqhkjOPQQDAgNJADBGAiEA4IWSoxe3jfkr\nBqWTrBqYaGFy+uGh0PsceGCmQ5nFuMQCIQCcAu/xlJyzlvnrxir4tiz+OpAUFteM\nYyRIHN8wfdVoOw==\n-----END CERTIFICATE-----\n"
    ]
  }
}
```

caList是证书列表；caIndex是使用的证书序号。

winasd程序内建议将云帐号容器目录命名为`homeDir`:

```js
const homeDir = path.join(Config.volume.cloud, Config.cloud.domain, Config.cloud.id)
```

ca证书因为有场景需要以文件路径形式提供，winasd每次启动时写入ca证书；

之前约定的在根卷放置文件控制domain的设计取消。

目前唯一的控制方法是在config.json内配置(domain， id)；其中id可以为空，为空时表示使用atecc序列号作为id；在app.js入口时会读出serial写入Config.cloud.id，其他模块可直接读取使用。








