# 解绑

{
    
}


unbind过程的http api返回格式修改如下：

解绑过程包括向云解绑和本地清理；其中本地清理winas目录可能需要很久的时间；

api返回时只要云端解绑成功即返回200。body内容：

如果请求未提供clean或clean为false，返回的body为空object；

如果请求clean： 

{
  clean: timeout, progressing, failed, succeeded
}

timeout 是返回时clean尚未开始

succeeded clean成功

failed clean失败

progressing 正在清除数据