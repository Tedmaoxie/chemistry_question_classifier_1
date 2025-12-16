import redis
import sys

try:
    r = redis.Redis(host='127.0.0.1', port=6379, db=0)
    r.ping()
    print("Redis is RUNNING")
except Exception as e:
    print(f"Redis is DOWN: {e}")
