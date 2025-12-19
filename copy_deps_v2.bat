@echo off
chcp 65001
set "SRC=D:\项目\chemistry-question-classifier-1\.venv\Lib\site-packages"
set "DST=D:\项目\chemistry-question-classifier-1\dist\chemistry_backend\_internal"

echo Copying dependencies...

robocopy "%SRC%\pandas" "%DST%\pandas" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\numpy" "%DST%\numpy" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\multipart" "%DST%\multipart" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\pytz" "%DST%\pytz" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\dateutil" "%DST%\dateutil" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\openpyxl" "%DST%\openpyxl" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\uvicorn" "%DST%\uvicorn" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\fastapi" "%DST%\fastapi" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\starlette" "%DST%\starlette" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\pydantic" "%DST%\pydantic" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\sqlalchemy" "%DST%\sqlalchemy" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\jinja2" "%DST%\jinja2" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\click" "%DST%\click" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\h11" "%DST%\h11" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\idna" "%DST%\idna" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\sniffio" "%DST%\sniffio" /E /NFL /NDL /R:1 /W:1
robocopy "%SRC%\anyio" "%DST%\anyio" /E /NFL /NDL /R:1 /W:1

echo Copying single files...
copy "%SRC%\typing_extensions.py" "%DST%\"
copy "%SRC%\six.py" "%DST%\"

echo Done.
exit /b 0
