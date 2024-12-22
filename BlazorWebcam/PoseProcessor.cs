using Microsoft.JSInterop;
using System.Threading.Tasks;

namespace BlazorWebcam.Shared
{
    public class PoseProcessor
    {
        private readonly IJSRuntime jsRuntime;

        public PoseProcessor(IJSRuntime jsRuntime)
        {
            this.jsRuntime = jsRuntime;
        }

        // Start the webcam
        public async Task StartVideo()
        {
            await jsRuntime.InvokeVoidAsync("startVideo", "videoFeed");
        }

        // Stop the webcam
        public async Task StopVideo()
        {
            await jsRuntime.InvokeVoidAsync("stopVideo", "videoFeed");
        }

        // Toggle pose estimation
        public async Task TogglePoseEstimation()
        {
            Console.WriteLine("Invoking togglePoseEstimation from Blazor");
            await jsRuntime.InvokeVoidAsync("togglePoseEstimation", "videoFeed", "poseCanvas");
        }


    }
}
