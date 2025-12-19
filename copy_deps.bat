@echo off
set SRC=d:\项目\chemistry-question-classifier-1\.venv\Lib\site-packages
set DST=d:\项目\chemistry-question-classifier-1\dist\chemistry_backend\_internal

echo Copying dependencies...

robocopy "%SRC%\pandas" "%DST%\pandas" /E /NFL /NDL
robocopy "%SRC%\numpy" "%DST%\numpy" /E /NFL /NDL
robocopy "%SRC%\multipart" "%DST%\multipart" /E /NFL /NDL
robocopy "%SRC%\pytz" "%DST%\pytz" /E /NFL /NDL
robocopy "%SRC%\dateutil" "%DST%\dateutil" /E /NFL /NDL
robocopy "%SRC%\openpyxl" "%DST%\openpyxl" /E /NFL /NDL
robocopy "%SRC%\uvicorn" "%DST%\uvicorn" /E /NFL /NDL
robocopy "%SRC%\fastapi" "%DST%\fastapi" /E /NFL /NDL
robocopy "%SRC%\starlette" "%DST%\starlette" /E /NFL /NDL
robocopy "%SRC%\pydantic" "%DST%\pydantic" /E /NFL /NDL
robocopy "%SRC%\sqlalchemy" "%DST%\sqlalchemy" /E /NFL /NDL
robocopy "%SRC%\jinja2" "%DST%\jinja2" /E /NFL /NDL
robocopy "%SRC%\click" "%DST%\click" /E /NFL /NDL
robocopy "%SRC%\h11" "%DST%\h11" /E /NFL /NDL
robocopy "%SRC%\idna" "%DST%\idna" /E /NFL /NDL
robocopy "%SRC%\sniffio" "%DST%\sniffio" /E /NFL /NDL
robocopy "%SRC%\anyio" "%DST%\anyio" /E /NFL /NDL
robocopy "%SRC%\typing_extensions.py" "%DST%" /NFL /NDL
robocopy "%SRC%\six.py" "%DST%" /NFL /NDL

echo Done.
exit /b 0
