import os
path = 'outputs/video_camera_01.mp4'
if os.path.exists(path):
    size = os.path.getsize(path)
    print(f'FILE_SIZE: {size} bytes')
else:
    print('FILE_NOT_FOUND')
