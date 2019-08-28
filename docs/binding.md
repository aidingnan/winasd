# 绑定流程

1. 设备上线， 停留***Unbound***态，channel 下发device信息

   ```json
   {
       "token": "0@eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzbiI6IjAxMjM0YmEzMjIxMThlZDNlZSIsImNlcnRJZCI6IjM4ZDhlZjA5MjU5MjIzYWRhZmVhNDA5ZmVlZTMzNTZhNmM0YjM1MTM4OWVmZjBjODEzNzRiYmUxNjhhNjNlOTkifQ.nRpoTW0TtZRXBRirKlrgQVPzbMwcCBdoqnPBQr6NX6c",
       "device": {
           "sn": "01234ba322118ed3ee",
           "certId": "38d8ef09259223adafea409feee3356a6c4b351389eff0c81374bbe168a63e99",
           "owner": null,
           "info": {
               "signature": "xxx",
               "raw": "{\"lifecycle\":30,\"op\":\"bind\",\"volume\":\"59ab8127-74e0-43c1-b12a-e3fc05107fd1\"}"
           },
           "config": {
               "root": false
           }
       }
   }
   ```

2. 客户端发起绑定。

   1. 客户端提供encrypted
   2. station 生成signature和raw，raw的内容为本次的op,当前的counter,以及期望下次的volumeUUID
   3. 带上1,2内容云上绑定

3. 云返回绑定成功并返回绑定用户后，跳转到***Binding***状态,持久化绑定用户，清理volume到指定UUID,counter+1

4. 跳转到***Bound***状态，返回客户端绑定成功, channel 重新连接 下发device信息

```json
{
    "token": "0@eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzbiI6IjAxMjM0YmEzMjIxMThlZDNlZSIsImNlcnRJZCI6IjM4ZDhlZjA5MjU5MjIzYWRhZmVhNDA5ZmVlZTMzNTZhNmM0YjM1MTM4OWVmZjBjODEzNzRiYmUxNjhhNjNlOTkifQ.nRpoTW0TtZRXBRirKlrgQVPzbMwcCBdoqnPBQr6NX6c",
    "device": {
        "sn": "01234ba322118ed3ee",
        "certId": "38d8ef09259223adafea409feee3356a6c4b351389eff0c81374bbe168a63e99",
        "owner": "a084ddb6-9990-4eb5-9c59-359838e415aa",
        "info": {
            "signature": "xxx",
            "raw": "{\"lifecycle\":30,\"op\":\"bind\",\"volume\":\"59ab8127-74e0-43c1-b12a-e3fc05107fd1\"}"
        },
        "username": "17621371636",
        "phone": "17621371636",
        "wechat": {
            "unionid": "oDql055ZqgjEYQ2tOjg-dZvAIaCs",
            "nickname": "JackYang",
            "avatarUrl": "http://xxx"
        },
        "users": [
            {
                "id": "a084ddb6-9990-4eb5-9c59-359838e415aa",
                "username": "17621371636",
                "avatarUrl": "https://xxx",
                "nickName": null,
                "isOwner": 1,
                "cloud": 1,
                "publicSpace": 1,
                "disable": 0,
                "delete": 0
            }
        ],
        "config": {
            "root": false
        }
    }
}
```

